/* eslint-disable typescript/switch-exhaustiveness-check, typescript/prefer-nullish-coalescing */
import type {
  DecoratorApplication,
  DecoratorArgument,
  EmitContext,
  Enum,
  Model,
  Namespace,
  Scalar,
  Type,
  Union,
} from '@typespec/compiler'
import { emitFile, isNumeric, resolvePath } from '@typespec/compiler'
import pascalCase from 'pascalcase'
import dedent from 'dedent'
import indentString from 'indent-string'
import {
  concat,
  entries,
  filter,
  flatMap,
  flatten,
  join,
  map,
  pipe,
  reduce,
  toArray,
  toMap,
  values,
} from 'lfi'
import toposort from 'toposort'
import keyalesce from 'keyalesce'

export async function $onEmit(context: EmitContext): Promise<void> {
  if (context.program.compilerOptions.noEmit) {
    return
  }

  const arbitraryNamespace = convertNamespace(
    context.program.getGlobalNamespaceType(),
  )
  const sharedArbitraries = collectSharedArbitraries(arbitraryNamespace)

  await emitFile(context.program, {
    path: resolvePath(context.emitterOutputDir, `arbitraries.js`),
    content: dedent`
      import * as fc from "fast-check"

      ${stringifyNamespace(arbitraryNamespace, sharedArbitraries)}
    `,
  })
}

const convertNamespace = (namespace: Namespace): ArbitraryNamespace => {
  const nameToArbitrary = pipe(
    concat<[string, Type]>(
      namespace.models,
      namespace.unions,
      namespace.enums,
      namespace.scalars,
    ),
    map(([name, type]): [string, Arbitrary] => [
      name,
      convertType(type, { propertyName: name }),
    ]),
    reduce(toMap()),
  )
  return {
    name: namespace.name,
    namespaces: pipe(
      namespace.namespaces,
      values,
      filter(namespace => namespace.name !== `TypeSpec`),
      map(convertNamespace),
      reduce(toArray()),
    ),
    nameToArbitrary,
    arbitraryToName: pipe(
      nameToArbitrary,
      map(([name, arbitrary]): [Arbitrary, string] => [arbitrary, name]),
      reduce(toMap()),
    ),
  }
}

const convertType = (type: Type, options?: ConvertTypeOptions): Arbitrary => {
  let arbitrary: Arbitrary
  switch (type.kind) {
    case `Model`:
      arbitrary = convertModel(type, options)
      break
    case `Union`:
      arbitrary = convertUnion(type, options)
      break
    case `Enum`:
      arbitrary = convertEnum(type, options)
      break
    case `Scalar`:
      arbitrary = convertScalar(type, options)
      break
    default:
      throw new Error(`Unhandled type: ${type.kind}`)
  }

  const arbitraryKey = keyalesce([
    arbitrary.name,
    arbitrary.code,
    ...pipe(arbitrary.placeholders, flatten),
  ])
  let cachedArbitrary = cachedArbitraries.get(arbitraryKey)
  if (!cachedArbitrary) {
    cachedArbitrary = arbitrary
    cachedArbitraries.set(arbitraryKey, cachedArbitrary)
  }
  return cachedArbitrary
}
type ConvertTypeOptions = {
  propertyName?: string
  decorators?: DecoratorApplication[]
}

const cachedArbitraries = new Map<object, Arbitrary>()

const convertModel = (
  model: Model,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  createArbitrary(model.name || propertyName || `Model`, emitType => {
    const dictionary = model.indexer
      ? model.indexer.key.name === `integer`
        ? `fc.array(${emitType(model.indexer.value)})`
        : `fc.dictionary(${emitType(model.indexer.key)}, ${emitType(model.indexer.value)})`
      : null
    const record =
      model.properties.size > 0
        ? `fc.record(${emitOptions(
            pipe(
              model.properties,
              map(([name, property]): [string, string] => [
                name,
                emitType(property.type, {
                  propertyName: name,
                  decorators: property.decorators,
                }),
              ]),
              reduce(toMap()),
            ),
            { emitEmpty: true },
          )})`
        : null
    if (dictionary && !record) {
      return dictionary
    } else if (!dictionary && record) {
      return record
    } else {
      return [
        `fc.tuple(`,
        indent(`${dictionary},`),
        indent(`${record},`),
        `).map(([dictionary, record]) => ({ ...dictionary, ...record }))`,
      ].join(`\n`)
    }
  })

const convertUnion = (
  union: Union,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  createArbitrary(union.name || propertyName || `Union`, emitType =>
    [
      `fc.oneof(`,
      indent(
        pipe(
          union.variants,
          map(
            ([, variant]) =>
              `${emitType(variant.type, {
                propertyName: String(variant.name),
                decorators: variant.decorators,
              })},`,
          ),
          join(`\n`),
        ),
      ),
      `)`,
    ].join(`\n`),
  )

const convertEnum = (
  $enum: Enum,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  createArbitrary(
    $enum.name || propertyName || `enum`,
    [
      `fc.constantFrom(`,
      indent(
        pipe(
          $enum.members,
          map(([, member]) => `${JSON.stringify(member.value)},`),
          join(`\n`),
        ),
      ),
      `)`,
    ].join(`\n`),
  )

const convertScalar = (
  scalar: Scalar,
  options?: ConvertTypeOptions,
): Arbitrary => {
  const arbitraryName = options?.propertyName || scalar.name || `Scalar`
  switch (scalar.name) {
    case `boolean`:
      return createArbitrary(arbitraryName, `fc.boolean()`)
    case `int8`:
      return convertInteger(scalar, options, { min: -128, max: 127 })
    case `int16`:
      return convertInteger(scalar, options, { min: -32_768, max: 32_767 })
    case `int32`:
      return convertInteger(scalar, options, {
        min: -2_147_483_648,
        max: 2_147_483_647,
      })
    case `int64`:
      return convertBigInteger(scalar, options, {
        min: -9_223_372_036_854_775_808n,
        max: 9_223_372_036_854_775_807n,
      })
    case `integer`:
      return convertBigInteger(scalar, options)
    case `float32`:
      return convertTypeFloat(scalar, options)
    case `float`:
    case `float64`:
    case `decimal`:
    case `decimal128`:
      return convertDouble(scalar, options)
    case `string`:
      return convertString(scalar, options)
    case `bytes`:
      return createArbitrary(arbitraryName, `fc.int8Array()`)
    case `url`:
      return createArbitrary(arbitraryName, `fc.webUrl()`)
  }

  throw new Error(`Unhandled Scalar: ${scalar.name}`)
}

const convertInteger = (
  integer: Scalar,
  // eslint-disable-next-line typescript/default-param-last
  { decorators = [] }: ConvertTypeOptions = {},
  { min, max }: { min: number; max: number },
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  )
  return createArbitrary(
    integer.name,
    `fc.integer(${emitOptions(
      new Map([
        [
          `min`,
          getDecoratorValue(
            Math.max(min, Number(nameToDecorator.get(`$minValue`)?.[0] ?? min)),
          ),
        ],
        [
          `max`,
          getDecoratorValue(
            Math.min(max, Number(nameToDecorator.get(`$maxValue`)?.[0] ?? max)),
          ),
        ],
      ]),
    )})`,
  )
}

const convertBigInteger = (
  integer: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
  { min, max }: { min?: bigint; max?: bigint } = {},
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, integer.decorators),
  )
  return createArbitrary(
    integer.name,
    `fc.bigInt(${emitOptions(
      new Map([
        [
          `min`,
          getDecoratorValue(
            min == null
              ? null
              : bigIntMax(
                  min,
                  // eslint-disable-next-line typescript/no-base-to-string
                  BigInt(String(nameToDecorator.get(`$minValue`)?.[0] ?? min)),
                ),
          ),
        ],
        [
          `max`,
          getDecoratorValue(
            max == null
              ? null
              : bigIntMin(
                  max,
                  // eslint-disable-next-line typescript/no-base-to-string
                  BigInt(String(nameToDecorator.get(`$maxValue`)?.[0] ?? max)),
                ),
          ),
        ],
      ]),
    )})`,
  )
}

const bigIntMax = (a: bigint, b: bigint) => (a > b ? a : b)
const bigIntMin = (a: bigint, b: bigint) => (a < b ? a : b)

const convertTypeFloat = (
  float: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, float.decorators),
  )
  return createArbitrary(
    float.name,
    `fc.float(${emitOptions(
      new Map([
        [`min`, getDecoratorValue(nameToDecorator.get(`$minValue`)?.[0])],
        [`max`, getDecoratorValue(nameToDecorator.get(`$maxValue`)?.[0])],
      ]),
    )})`,
  )
}

const convertDouble = (
  double: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, double.decorators),
  )
  return createArbitrary(
    double.name,
    `fc.double(${emitOptions(
      new Map([
        [`min`, getDecoratorValue(nameToDecorator.get(`$minValue`)?.[0])],
        [`max`, getDecoratorValue(nameToDecorator.get(`$maxValue`)?.[0])],
      ]),
    )})`,
  )
}

const convertString = (
  string: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
): Arbitrary => {
  const nameToDecorator = getNameToDecorator(
    concat(decorators, string.decorators),
  )
  return createArbitrary(
    string.name,
    `fc.string(${emitOptions(
      new Map([
        [
          `minLength`,
          getDecoratorValue(nameToDecorator.get(`$minLength`)?.[0]),
        ],
        [
          `maxLength`,
          getDecoratorValue(nameToDecorator.get(`$maxLength`)?.[0]),
        ],
      ]),
    )})`,
  )
}

const getNameToDecorator = (
  decorators: Iterable<DecoratorApplication>,
): Map<string, DecoratorArgument[`jsValue`][]> =>
  pipe(
    decorators,
    map((decorator): [string, DecoratorArgument[`jsValue`][]] => [
      decorator.decorator.name,
      decorator.args.map(arg => arg.jsValue),
    ]),
    reduce(toMap()),
  )

const getDecoratorValue = (
  value: DecoratorArgument[`jsValue`] | undefined | bigint,
): string | null => {
  if (value == null) {
    return null
  }

  if (typeof value === `bigint`) {
    return `${value}n`
  }

  if (isNumeric(value)) {
    return String(value.asNumber() ?? `${value.asBigInt()}n`)
  }

  return JSON.stringify(value)
}

const emitOptions = (
  properties: Map<string, string | undefined | null>,
  { emitEmpty = false }: { emitEmpty?: boolean } = {},
): string => {
  const options = pipe(
    entries(properties),
    filter(([, value]) => value != null),
    map(([key, value]) => `${key}: ${value},`),
    join(`\n`),
  )
  if (!options) {
    return emitEmpty ? `{}` : ``
  }

  return [`{`, indent(options), `}`].join(`\n`)
}

const indent = (code: string) => indentString(code, 2, { indent: ` ` })

const createArbitrary = (
  name: string,
  codeOrFn:
    | string
    | ((
        emitType: (...args: Parameters<typeof convertType>) => string,
      ) => string),
): Arbitrary => {
  name = pascalCase(name)

  if (typeof codeOrFn === `string`) {
    return { name, code: codeOrFn, placeholders: new Map() }
  }

  let index = 0
  const placeholders = new Map<string, Arbitrary>()
  return {
    name,
    code: codeOrFn((type, options) => {
      const placeholder = `$${index++}`
      placeholders.set(placeholder, convertType(type, options))
      return placeholder
    }),
    placeholders,
  }
}

const collectSharedArbitraries = (
  namespace: ArbitraryNamespace,
): Map<Arbitrary, string> => {
  const arbitraryReferenceCounts = new Map<Arbitrary, number>()
  const allArbitraries = new Set<Arbitrary>()

  const remainingNamespaces = [namespace]
  do {
    const namespace = remainingNamespaces.pop()!
    remainingNamespaces.push(...namespace.namespaces)

    for (const namespaceArbitrary of namespace.arbitraryToName.keys()) {
      arbitraryReferenceCounts.set(
        namespaceArbitrary,
        (arbitraryReferenceCounts.get(namespaceArbitrary) ?? 0) + 1,
      )
    }

    const remainingArbitraries = [...namespace.arbitraryToName.keys()]
    while (remainingArbitraries.length > 0) {
      const arbitrary = remainingArbitraries.pop()!
      allArbitraries.add(arbitrary)

      for (const referencedArbitrary of arbitrary.placeholders.values()) {
        remainingArbitraries.push(referencedArbitrary)
        arbitraryReferenceCounts.set(
          referencedArbitrary,
          (arbitraryReferenceCounts.get(referencedArbitrary) ?? 0) + 1,
        )
      }
    }
  } while (remainingNamespaces.length > 0)

  const sharedArbitraryDependencyGraph = pipe(
    allArbitraries,
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
  )
  const sortedSharedArbitraries = toposort(
    sharedArbitraryDependencyGraph,
  ).reverse()

  const nextIndices = new Map<string, number>()
  return pipe(
    sortedSharedArbitraries,
    filter(arbitrary => (arbitraryReferenceCounts.get(arbitrary) ?? 0) >= 2),
    map((arbitrary): [Arbitrary, string] => {
      let name = namespace.arbitraryToName.get(arbitrary) ?? arbitrary.name
      const nextIndex = nextIndices.get(name)
      if (nextIndex == null) {
        nextIndices.set(name, 0)
      } else {
        nextIndices.set(name, nextIndex + 1)
        name += nextIndex
      }

      return [arbitrary, name]
    }),
    reduce(toMap()),
  )
}

const stringifyNamespace = (
  namespace: ArbitraryNamespace,
  sharedArbitraries: Map<Arbitrary, string>,
): string => {
  if (!namespace.name) {
    return stringifyTopLevelNamespace(namespace, sharedArbitraries)
  }

  return [
    `{`,
    indent(
      pipe(
        concat(
          map(
            namespace =>
              `${namespace.name}: ${stringifyNamespace(namespace, sharedArbitraries)},`,
            namespace.namespaces,
          ),
          map(
            ([name, arbitrary]) =>
              `${name}: ${stringifyArbitrary(arbitrary, sharedArbitraries)},`,
            entries(namespace.nameToArbitrary),
          ),
        ),
        join(`\n\n`),
      ),
    ),
    `}`,
  ].join(`\n`)
}

const stringifyTopLevelNamespace = (
  namespace: ArbitraryNamespace,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  pipe(
    concat(
      map(
        ([arbitrary, name]) =>
          `${namespace.arbitraryToName.has(arbitrary) ? `export ` : ``}const ${name} = ${stringifyArbitraryDefinition(arbitrary, sharedArbitraries)};\n`,
        entries(sharedArbitraries),
      ),
      map(
        namespace =>
          `export const ${namespace.name} = ${stringifyNamespace(namespace, sharedArbitraries)};\n`,
        namespace.namespaces,
      ),
      pipe(
        entries(namespace.nameToArbitrary),
        filter(([, arbitrary]) => !sharedArbitraries.has(arbitrary)),
        map(
          ([name, arbitrary]) =>
            `export const ${name} = ${stringifyArbitrary(arbitrary, sharedArbitraries)};\n`,
        ),
      ),
    ),
    join(`\n`),
  )

type ArbitraryNamespace = {
  name: string
  namespaces: ArbitraryNamespace[]
  nameToArbitrary: Map<string, Arbitrary>
  arbitraryToName: Map<Arbitrary, string>
}

const stringifyArbitrary = (
  arbitrary: Arbitrary,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  sharedArbitraries.get(arbitrary) ??
  stringifyArbitraryDefinition(arbitrary, sharedArbitraries)

const stringifyArbitraryDefinition = (
  arbitrary: Arbitrary,
  sharedArbitraries: Map<Arbitrary, string>,
): string =>
  [...arbitrary.placeholders].reduce(
    (code, [name, placeholder]) =>
      code.replace(name, stringifyArbitrary(placeholder, sharedArbitraries)),
    arbitrary.code,
  )

type Arbitrary = {
  name: string
  code: string
  placeholders: Map<string, Arbitrary>
}
