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

const emitModel = (model: Model): string =>
  `fc.record(${emitOptions(
    pipe(
      model.properties,
      map(([name, property]): [string, string] => [
        name,
        emitType(property.type, property.decorators),
      ]),
      reduce(toObject()),
    ),
    { emitEmpty: true },
  )})`;

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
    case "int32":
      return emitInteger(scalar, decorators);
    case "string":
      return emitString(scalar, decorators);
  }
  throw new Error(`Unhandled Scalar: ${scalar.name}`);
};

const emitInteger = (integer: Scalar, decorators: DecoratorApplication[]) => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  );
  return `fc.integer(${emitOptions({
    min: nameToDecorator.$minValue?.[0],
    max: nameToDecorator.$maxValue?.[0],
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
    minLength: nameToDecorator.$minLength?.[0],
    maxLength: nameToDecorator.$maxLength?.[0],
  })})`;
};

const getNameToDecorator = (
  decorators: Iterable<DecoratorApplication>,
): Record<string, string[]> =>
  pipe(
    decorators,
    map((decorator): [string, string[]] => [
      decorator.decorator.name,
      decorator.args.map((arg) => {
        const value = arg.jsValue;
        return JSON.stringify(isNumeric(value) ? value.asNumber() : value);
      }),
    ]),
    reduce(toObject()),
  );

const emitOptions = (
  properties: Record<string, string | undefined>,
  { emitEmpty = false }: { emitEmpty?: boolean } = {},
): string => {
  const options = pipe(
    entries(properties),
    filter(([, value]) => value !== undefined),
    map(([key, value]) => `${key}: ${value},`),
    join("\n"),
  );
  if (!options) {
    return emitEmpty ? "{}" : "";
  }

  return ["{", indent(options), "}"].join("\n");
};

const indent = (code: string) => indentString(code, 2, { indent: " " });
