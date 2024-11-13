import {
  EmitContext,
  emitFile,
  resolvePath,
  Type,
  Namespace,
  Enum,
  Model,
  Union,
  Scalar,
  DecoratorApplication,
  isNumeric,
  DecoratorArgument,
} from "@typespec/compiler";
import indentString from "indent-string";
import {
  concat,
  entries,
  filter,
  filterMap,
  flatMap,
  index,
  join,
  map,
  pipe,
  reduce,
  toArray,
  toMap,
  toObject,
  toSet,
  values,
} from "lfi";
import memoize from "memoize";
import toposort from "toposort";

export async function $onEmit(context: EmitContext) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  let arbitraryNamespace = convertNamespace(
    context.program.getGlobalNamespaceType(),
  );
  // The global namespace will always have one user defined namespace, which should be the top-level namespace
  // of the emitted JS file.
  arbitraryNamespace = {
    ...arbitraryNamespace.namespaces[0]!,
    name: "",
  };

  await emitFile(context.program, {
    path: resolvePath(context.emitterOutputDir, "output.js"),
    content: `import * as fc from "fc"\n\n${stringifyNamespace(
      arbitraryNamespace,
      collectSharedArbitraries(arbitraryNamespace),
    )}`,
  });
}

const convertNamespace = (namespace: Namespace): ArbitraryNamespace => ({
  name: namespace.name,
  namespaces: pipe(
    namespace.namespaces,
    values,
    filter((namespace) => namespace.name !== "TypeSpec"),
    map(convertNamespace),
    reduce(toArray()),
  ),
  arbitraries: pipe(
    concat<[string, Type]>(
      namespace.models,
      namespace.unions,
      namespace.enums,
      namespace.scalars,
    ),
    map(([name, type]): [string, Arbitrary] => [name, convertType(type)]),
    reduce(toObject()),
  ),
});

const convertType = memoize(
  (type: Type, decorators: DecoratorApplication[] = []): Arbitrary => {
    switch (type.kind) {
      case "Model":
        return convertModel(type);
      case "Union":
        return convertUnion(type);
      case "Enum":
        return convertEnum(type);
      case "Scalar":
        return convertScalar(type, decorators);
    }

    throw new Error(`Unhandled type: ${type.kind}`);
  },
);

const convertModel = (model: Model): Arbitrary =>
  createArbitrary((emitType) => {
    const dictionary = model.indexer
      ? model.indexer.key.name === "integer"
        ? `fc.array(${emitType(model.indexer.value)})`
        : `fc.dictionary(${emitType(model.indexer.key)}, ${emitType(model.indexer.value)})`
      : null;
    const record =
      model.properties.size > 0
        ? `fc.record(${emitOptions(
            pipe(
              model.properties,
              map(([name, property]): [string, string] => [
                name,
                emitType(property.type, property.decorators),
              ]),
              reduce(toObject()),
            ),
            { emitEmpty: true },
          )})`
        : null;
    if (dictionary && !record) {
      return dictionary;
    } else if (!dictionary && record) {
      return record;
    } else {
      return [
        "fc.tuple(",
        indent(`${dictionary},`),
        indent(`${record},`),
        ").map(([dictionary, record]) => ({ ...dictionary, ...record }))",
      ].join("\n");
    }
  });

const convertUnion = (union: Union): Arbitrary =>
  createArbitrary((emitType) =>
    [
      "fc.oneof(",
      indent(
        pipe(
          union.variants,
          map(([, variant]) => `${emitType(variant.type)},`),
          join("\n"),
        ),
      ),
      ")",
    ].join("\n"),
  );

const convertEnum = ($enum: Enum): Arbitrary =>
  createArbitrary(
    [
      "fc.constantFrom(",
      indent(
        pipe(
          $enum.members,
          map(([, member]) => `${JSON.stringify(member.value)},`),
          join("\n"),
        ),
      ),
      ")",
    ].join("\n"),
  );

const convertScalar = (
  scalar: Scalar,
  decorators: DecoratorApplication[] = [],
): Arbitrary => {
  switch (scalar.name) {
    case "boolean":
      return createArbitrary("fc.boolean()");
    case "int8":
      return convertInteger(scalar, decorators, { min: -128, max: 127 });
    case "int16":
      return convertInteger(scalar, decorators, { min: -32_768, max: 32_767 });
    case "int32":
      return convertInteger(scalar, decorators, {
        min: -2_147_483_648,
        max: 2_147_483_647,
      });
    case "int64":
      return convertBigInteger(scalar, decorators, {
        min: -9_223_372_036_854_775_808n,
        max: 9_223_372_036_854_775_807n,
      });
    case "integer":
      return convertBigInteger(scalar, decorators);
    case "float32":
      return convertTypeFloat(scalar, decorators);
    case "float":
    case "float64":
    case "decimal":
    case "decimal128":
      return convertDouble(scalar, decorators);
    case "string":
      return convertString(scalar, decorators);
    case "bytes":
      return createArbitrary("fc.int8Array()");
    case "url":
      return createArbitrary("fc.webUrl()");
  }

  throw new Error(`Unhandled Scalar: ${scalar.name}`);
};

const convertInteger = (
  integer: Scalar,
  decorators: DecoratorApplication[],
  { min, max }: { min: number; max: number },
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  );
  return createArbitrary(
    `fc.integer(${emitOptions({
      min: getDecoratorValue(
        Math.max(min, Number(nameToDecorator.$minValue?.[0] ?? min)),
      ),
      max: getDecoratorValue(
        Math.min(max, Number(nameToDecorator.$maxValue?.[0] ?? max)),
      ),
    })})`,
  );
};

const convertBigInteger = (
  integer: Scalar,
  decorators: DecoratorApplication[],
  { min, max }: { min?: bigint; max?: bigint } = {},
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  );
  return createArbitrary(
    `fc.bigInt(${emitOptions({
      min: getDecoratorValue(
        min == null
          ? null
          : bigIntMax(
              min,
              BigInt(String(nameToDecorator.$minValue?.[0] ?? min)),
            ),
      ),
      max: getDecoratorValue(
        max == null
          ? null
          : bigIntMin(
              max,
              BigInt(String(nameToDecorator.$maxValue?.[0] ?? max)),
            ),
      ),
    })})`,
  );
};

const bigIntMax = (a: bigint, b: bigint) => (a > b ? a : b);
const bigIntMin = (a: bigint, b: bigint) => (a < b ? a : b);

const convertTypeFloat = (
  float: Scalar,
  decorators: DecoratorApplication[],
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, float.decorators),
  );
  return createArbitrary(
    `fc.float(${emitOptions({
      min: getDecoratorValue(nameToDecorator.$minValue?.[0]),
      max: getDecoratorValue(nameToDecorator.$maxValue?.[0]),
    })})`,
  );
};

const convertDouble = (
  double: Scalar,
  decorators: DecoratorApplication[],
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, double.decorators),
  );
  return createArbitrary(
    `fc.double(${emitOptions({
      min: getDecoratorValue(nameToDecorator.$minValue?.[0]),
      max: getDecoratorValue(nameToDecorator.$maxValue?.[0]),
    })})`,
  );
};

const convertString = (
  string: Scalar,
  decorators: DecoratorApplication[],
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, string.decorators),
  );
  return createArbitrary(
    `fc.string(${emitOptions({
      minLength: getDecoratorValue(nameToDecorator.$minLength?.[0]),
      maxLength: getDecoratorValue(nameToDecorator.$maxLength?.[0]),
    })})`,
  );
};

const getNameToDecorator = (
  decorators: Iterable<DecoratorApplication>,
): Record<string, DecoratorArgument["jsValue"][]> =>
  pipe(
    decorators,
    map((decorator): [string, DecoratorArgument["jsValue"][]] => [
      decorator.decorator.name,
      decorator.args.map((arg) => arg.jsValue),
    ]),
    reduce(toObject()),
  );

const getDecoratorValue = (
  value: DecoratorArgument["jsValue"] | bigint,
): string | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (isNumeric(value)) {
    return String(value.asNumber() ?? `${value.asBigInt()}n`);
  }

  return JSON.stringify(value);
};

const emitOptions = (
  properties: Record<string, string | undefined | null>,
  { emitEmpty = false }: { emitEmpty?: boolean } = {},
): string => {
  const options = pipe(
    entries(properties),
    filter(([, value]) => value != null),
    map(([key, value]) => `${key}: ${value},`),
    join("\n"),
  );
  if (!options) {
    return emitEmpty ? "{}" : "";
  }

  return ["{", indent(options), "}"].join("\n");
};

const indent = (code: string) => indentString(code, 2, { indent: " " });

const createArbitrary = (
  codeOrFn:
    | string
    | ((
        emitType: (...args: Parameters<typeof convertType>) => string,
      ) => string),
): Arbitrary => {
  if (typeof codeOrFn === "string") {
    return { code: codeOrFn, placeholders: new Map() };
  }

  let index = 0;
  const placeholders = new Map<string, Arbitrary>();
  return {
    code: codeOrFn((type) => {
      const placeholder = `$${index++}`;
      placeholders.set(placeholder, convertType(type));
      return placeholder;
    }),
    placeholders,
  };
};

const collectSharedArbitraries = (
  namespace: ArbitraryNamespace,
): Map<Arbitrary, string> => {
  const sharedArbitraries = new Set<Arbitrary>();
  const countArbitraryReferences = (namespace: ArbitraryNamespace) => {
    for (const nestedNamespace of namespace.namespaces) {
      countArbitraryReferences(nestedNamespace);
    }
    for (const arbitrary of Object.values(namespace.arbitraries)) {
      sharedArbitraries.add(arbitrary);
    }
  };
  countArbitraryReferences(namespace);

  const sharedArbitraryDependencyGraph = pipe(
    sharedArbitraries,
    flatMap(
      (arbitrary): Iterable<[Arbitrary, Arbitrary | undefined]> =>
        arbitrary.placeholders.size === 0
          ? [[arbitrary, undefined]]
          : pipe(
              arbitrary.placeholders,
              values,
              map((dependency): [Arbitrary, Arbitrary] => [
                arbitrary,
                dependency,
              ]),
            ),
    ),
    reduce(toArray()),
  );
  return pipe(
    toposort(sharedArbitraryDependencyGraph).reverse(),
    filter((arbitrary) => sharedArbitraries.has(arbitrary)),
    index,
    map(([index, arbitrary]): [Arbitrary, string] => [
      arbitrary,
      `shared${index}`,
    ]),
    reduce(toMap()),
  );
};

const stringifyNamespace = (
  namespace: ArbitraryNamespace,
  sharedArbitraries: Map<Arbitrary, string>,
): string => {
  if (!namespace.name) {
    return stringifyTopLevelNamespace(namespace, sharedArbitraries);
  }

  return [
    "{",
    indent(
      pipe(
        concat(
          map(
            (namespace) =>
              `${namespace.name}: ${stringifyNamespace(namespace, sharedArbitraries)},`,
            namespace.namespaces,
          ),
          map(
            ([name, arbitrary]) =>
              `${name}: ${stringifyArbitrary(arbitrary, sharedArbitraries)},`,
            entries(namespace.arbitraries),
          ),
        ),
        join("\n\n"),
      ),
    ),
    "}",
  ].join("\n");
};

const stringifyTopLevelNamespace = (
  namespace: ArbitraryNamespace,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  pipe(
    concat(
      map(
        ([arbitrary, name]) =>
          `export const ${name} = ${stringifyArbitraryDefinition(arbitrary, sharedArbitraries)};\n`,
        entries(sharedArbitraries),
      ),
      map(
        (namespace) =>
          `export const ${namespace.name} = ${stringifyNamespace(namespace, sharedArbitraries)};\n`,
        namespace.namespaces,
      ),
      map(
        ([name, arbitrary]) =>
          `export const ${name} = ${stringifyArbitrary(arbitrary, sharedArbitraries)};\n`,
        entries(namespace.arbitraries),
      ),
    ),
    join("\n\n"),
  );

type ArbitraryNamespace = {
  name: string;
  namespaces: ArbitraryNamespace[];
  arbitraries: Record<string, Arbitrary>;
};

const stringifyArbitrary = (
  arbitrary: Arbitrary,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  sharedArbitraries.get(arbitrary) ??
  stringifyArbitraryDefinition(arbitrary, sharedArbitraries);

const stringifyArbitraryDefinition = (
  arbitrary: Arbitrary,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  [...arbitrary.placeholders].reduce(
    (code, [name, placeholder]) =>
      code.replace(name, stringifyArbitrary(placeholder, sharedArbitraries)),
    arbitrary.code,
  );

type Arbitrary = {
  code: string;
  placeholders: Map<string, Arbitrary>;
};
