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
  flatMap,
  join,
  map,
  pipe,
  reduce,
  toObject,
  values,
} from "lfi";

export async function $onEmit(context: EmitContext) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  await emitFile(context.program, {
    path: resolvePath(context.emitterOutputDir, "output.js"),
    content: pipe(
      concat(
        [`import * as fc from "fast-check";\n`],
        pipe(
          context.program.getGlobalNamespaceType().namespaces,
          values,
          filter((namespace) => namespace.name !== "TypeSpec"),
          flatMap((namespace) =>
            concat<[string, Type]>(namespace.namespaces, namespace.models),
          ),
          map(([name, type]) => `export const ${name} = ${emitType(type)};\n`),
        ),
      ),
      join("\n"),
    ),
  });
}

const emitType = (
  type: Type,
  decorators: DecoratorApplication[] = [],
): string => {
  switch (type.kind) {
    case "Namespace":
      return emitNamespace(type);
    case "Model":
      return emitModel(type);
    case "Union":
      return emitUnion(type);
    case "Enum":
      return emitEnum(type);
    case "Scalar":
      return emitScalar(type, decorators);
  }

  throw new Error(`Unhandled type: ${type.kind}`);
};

const emitNamespace = (namespace: Namespace): string =>
  [
    "{",
    indent(
      pipe(
        concat<[string, Type]>(namespace.namespaces, namespace.models),
        map(([name, type]) => `${name}: ${emitType(type)},`),
        join("\n\n"),
      ),
    ),
    "}",
  ].join("\n");

const emitModel = (model: Model): string => {
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
};

const emitUnion = (union: Union): string =>
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
  ].join("\n");

const emitEnum = ($enum: Enum): string =>
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
  ].join("\n");

const emitScalar = (
  scalar: Scalar,
  decorators: DecoratorApplication[] = [],
): string => {
  switch (scalar.name) {
    case "boolean":
      return "fc.boolean()";
    case "int8":
      return emitInteger(scalar, decorators, { min: -128, max: 127 });
    case "int16":
      return emitInteger(scalar, decorators, { min: -32_768, max: 32_767 });
    case "int32":
      return emitInteger(scalar, decorators, {
        min: -2_147_483_648,
        max: 2_147_483_647,
      });
    case "float32":
      return emitFloat(scalar, decorators);
    case "float64":
      return emitDouble(scalar, decorators);
    case "string":
      return emitString(scalar, decorators);
  }
  throw new Error(`Unhandled Scalar: ${scalar.name}`);
};

const emitInteger = (
  integer: Scalar,
  decorators: DecoratorApplication[],
  { min, max }: { min: number; max: number },
) => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  );
  return `fc.integer(${emitOptions({
    min: getDecoratorValue(
      Math.max(min, Number(nameToDecorator.$minValue?.[0] ?? min)),
    ),
    max: getDecoratorValue(
      Math.min(max, Number(nameToDecorator.$maxValue?.[0] ?? max)),
    ),
  })})`;
};

const emitFloat = (float: Scalar, decorators: DecoratorApplication[]) => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, float.decorators),
  );
  return `fc.float(${emitOptions({
    min: getDecoratorValue(nameToDecorator.$minValue?.[0]),
    max: getDecoratorValue(nameToDecorator.$maxValue?.[0]),
  })})`;
};

const emitDouble = (double: Scalar, decorators: DecoratorApplication[]) => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, double.decorators),
  );
  return `fc.double(${emitOptions({
    min: getDecoratorValue(nameToDecorator.$minValue?.[0]),
    max: getDecoratorValue(nameToDecorator.$maxValue?.[0]),
  })})`;
};

const emitString = (
  string: Scalar,
  decorators: DecoratorApplication[],
): string => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, string.decorators),
  );
  return `fc.string(${emitOptions({
    minLength: getDecoratorValue(nameToDecorator.$minLength?.[0]),
    maxLength: getDecoratorValue(nameToDecorator.$maxLength?.[0]),
  })})`;
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
  value: DecoratorArgument["jsValue"],
): string | null =>
  value == null
    ? null
    : JSON.stringify(isNumeric(value) ? value.asNumber() : value);

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
