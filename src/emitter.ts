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
} from "@typespec/compiler";
import indentString from "indent-string";
import {
  concat,
  filter,
  filterMap,
  flatMap,
  join,
  map,
  pipe,
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

const emitType = (type: Type, decorators: DecoratorApplication[] = []): string => {
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
  [
    "fc.record({",
    indent(
      pipe(
        model.properties,
        map(([name, property]) => `${name}: ${emitType(property.type, property.decorators)},`),
        join("\n"),
      ),
    ),
    "})",
  ].join("\n");

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
  `fc.constantFrom(${pipe(
    $enum.members,
    map(([, member]) => JSON.stringify(member.value)),
    join(", "),
  )})`;

const emitScalar = (scalar: Scalar, decorators: DecoratorApplication[] = []): string => {
  switch (scalar.name) {
    case "int32":
      return "fc.integer()";
    case "string":
      return emitString(scalar, decorators);
  }
  throw new Error(`Unhandled Scalar: ${scalar.name}`);
};

const emitString = (string: Scalar, decorators: DecoratorApplication[]): string => {
  const options = pipe(
    concat(decorators, string.decorators),
    filterMap((decorator): [string, string] | null => {
      switch (decorator.decorator.name) {
        case "$minLength":
          return ["minLength", String(Number(decorator.args[0]?.jsValue))];
      }

      return null;
    }),
    map(([key, value]) => `${key}: ${value},`),
    join("\n"),
  );
  if (!options) {
    return "fc.string()";
  }

  return ["fc.string({", indent(options), "})"].join("\n");
};

const indent = (code: string) => indentString(code, 2, { indent: " " });
