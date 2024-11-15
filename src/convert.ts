/* eslint-disable typescript/prefer-nullish-coalescing */
import { isNumeric } from '@typespec/compiler'
import type {
  DecoratorApplication,
  Enum,
  Model,
  Namespace,
  Program,
  Scalar,
  Type,
  Union,
} from '@typespec/compiler'
import {
  concat,
  filter,
  flatMap,
  flatten,
  map,
  pipe,
  reduce,
  toArray,
  toMap,
  toSet,
  values,
} from 'lfi'
import pascalcase from 'pascalcase'
import keyalesce from 'keyalesce'
import toposort from 'toposort'
import type { Arbitrary, ArbitraryNamespace } from './arbitrary.ts'

const convertProgram = (
  program: Program,
): {
  namespace: ArbitraryNamespace
  sharedArbitraries: Set<Arbitrary>
} => {
  const namespace = convertNamespace(program.getGlobalNamespaceType())
  const sharedArbitraries = collectSharedArbitraries(namespace)
  return { namespace, sharedArbitraries }
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
      values(namespace.namespaces),
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
  // eslint-disable-next-line typescript/switch-exhaustiveness-check
  switch (type.kind) {
    case `Model`:
      return convertModel(type, options)
    case `Union`:
      return convertUnion(type, options)
    case `Enum`:
      return convertEnum(type, options)
    case `Scalar`:
      return convertScalar(type, options)
  }

  throw new Error(`Unhandled type: ${type.kind}`)
}
type ConvertTypeOptions = {
  propertyName?: string
  decorators?: DecoratorApplication[]
}

const convertModel = (
  model: Model,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  memoize({
    type: `record`,
    name: pascalcase(model.name || propertyName || `Record`),
    properties: pipe(
      model.properties,
      map(([name, { type, decorators }]): [string, Arbitrary] => [
        name,
        convertType(type, { propertyName: name, decorators }),
      ]),
      reduce(toMap()),
    ),
  })

const convertUnion = (
  union: Union,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  memoize({
    type: `union`,
    name: pascalcase(union.name || propertyName || `Union`),
    variants: pipe(
      union.variants,
      map(([, { type, name, decorators }]) =>
        convertType(type, { propertyName: String(name), decorators }),
      ),
      reduce(toArray()),
    ),
  })

const convertEnum = (
  $enum: Enum,
  { propertyName }: ConvertTypeOptions = {},
): Arbitrary =>
  memoize({
    type: `enum`,
    name: pascalcase($enum.name || propertyName || `Enum`),
    values: pipe(
      $enum.members,
      map(([, { value }]) => JSON.stringify(value)),
      reduce(toArray()),
    ),
  })

const convertScalar = (
  scalar: Scalar,
  options?: ConvertTypeOptions,
): Arbitrary => {
  const name = options?.propertyName || scalar.name || `Scalar`
  switch (scalar.name) {
    case `boolean`:
      return memoize({ type: `boolean`, name })
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
      return convertBigint(scalar, options, {
        min: -9_223_372_036_854_775_808n,
        max: 9_223_372_036_854_775_807n,
      })
    case `integer`:
      return convertBigint(scalar, options)
    case `float32`:
      return convertFloat(scalar, options)
    case `string`:
      return convertString(scalar, options)
  }

  throw new Error(`Unhandled Scalar: ${scalar.name}`)
}

const convertInteger = (
  integer: Scalar,
  // eslint-disable-next-line typescript/default-param-last
  { decorators = [] }: ConvertTypeOptions = {},
  { min, max }: { min: number; max: number },
): Arbitrary => {
  const nameToDecorator = convertDecorators(
    concat(decorators, integer.decorators),
  )
  const decoratorMin = nameToDecorator.get(`$min`)?.number(0)
  const decoratorMax = nameToDecorator.get(`$max`)?.number(0)

  return memoize({
    type: `integer`,
    name: integer.name,
    min: decoratorMin == null ? min : Math.max(min, decoratorMin),
    max: decoratorMax == null ? max : Math.min(max, decoratorMax),
  })
}

const convertBigint = (
  integer: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
  { min, max }: { min?: bigint; max?: bigint } = {},
): Arbitrary => {
  const nameToDecorator = convertDecorators(
    concat(decorators, integer.decorators),
  )
  const decoratorMin = nameToDecorator.get(`$min`)?.bigint(0)
  const decoratorMax = nameToDecorator.get(`$max`)?.bigint(0)

  return memoize({
    type: `big-integer`,
    name: integer.name,
    min:
      decoratorMin == null ? min : bigintMax(min ?? decoratorMin, decoratorMin),
    max:
      decoratorMax == null ? max : bigintMin(max ?? decoratorMax, decoratorMax),
  })
}

const bigintMax = (a: bigint, b: bigint) => (a > b ? a : b)
const bigintMin = (a: bigint, b: bigint) => (a < b ? a : b)

const convertFloat = (
  float: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
): Arbitrary => {
  const nameToDecorator = convertDecorators(
    concat(decorators, float.decorators),
  )

  return memoize({
    type: `float`,
    name: float.name,
    min: nameToDecorator.get(`$min`)?.number(0) ?? undefined,
    max: nameToDecorator.get(`$max`)?.number(0) ?? undefined,
  })
}

const convertString = (
  string: Scalar,
  { decorators = [] }: ConvertTypeOptions = {},
): Arbitrary => {
  const nameToDecorator = convertDecorators(
    concat(decorators, string.decorators),
  )

  return memoize({
    type: `string`,
    name: string.name,
    minLength: nameToDecorator.get(`$minLength`)?.number(0) ?? undefined,
    maxLength: nameToDecorator.get(`$maxLength`)?.number(0) ?? undefined,
  })
}

const memoize = (arbitrary: Arbitrary): Arbitrary => {
  const arbitraryKey = getArbitraryKey(arbitrary)
  let cachedArbitrary = cachedArbitraries.get(arbitraryKey)
  if (!cachedArbitrary) {
    cachedArbitrary = arbitrary
    cachedArbitraries.set(arbitraryKey, cachedArbitrary)
  }
  return cachedArbitrary
}

const getArbitraryKey = (arbitrary: Arbitrary): ArbitraryKey => {
  switch (arbitrary.type) {
    case `boolean`:
      return keyalesce([arbitrary.type, arbitrary.name])
    case `record`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        ...flatten(arbitrary.properties),
      ])
    case `dictionary`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        arbitrary.key,
        arbitrary.value,
      ])
    case `array`:
      return keyalesce([arbitrary.type, arbitrary.name, arbitrary.value])
    case `union`:
      return keyalesce([arbitrary.type, arbitrary.name, ...arbitrary.variants])
    case `enum`:
      return keyalesce([arbitrary.type, arbitrary.name, ...arbitrary.values])
    case `integer`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        arbitrary.min,
        arbitrary.max,
      ])
    case `big-integer`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        arbitrary.min,
        arbitrary.max,
      ])
    case `float`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        arbitrary.min,
        arbitrary.max,
      ])
    case `string`:
      return keyalesce([
        arbitrary.type,
        arbitrary.name,
        arbitrary.minLength,
        arbitrary.maxLength,
      ])
  }
}

const cachedArbitraries = new Map<ArbitraryKey, Arbitrary>()
type ArbitraryKey = ReturnType<typeof keyalesce>

const convertDecorators = (
  decorators: Iterable<DecoratorApplication>,
): Map<string, DecoratorArguments> =>
  pipe(
    decorators,
    map((decorator): [string, DecoratorArguments] => [
      decorator.decorator.name,
      {
        number: index => {
          const argument = decorator.args[index]
          if (!argument) {
            return null
          }

          const value = argument.jsValue
          if (isNumeric(value)) {
            return value.asNumber()
          }

          if (typeof value === `number`) {
            return value
          }

          return null
        },
        bigint: index => {
          const argument = decorator.args[index]
          if (!argument) {
            return null
          }

          const value = argument.jsValue
          if (isNumeric(value)) {
            return value.asBigInt()
          }

          if (typeof value === `number`) {
            return BigInt(value)
          }

          if (typeof value === `bigint`) {
            return value
          }

          return null
        },
      },
    ]),
    reduce(toMap()),
  )
type DecoratorArguments = {
  number: (index: number) => number | null
  bigint: (index: number) => bigint | null
}

const collectSharedArbitraries = (
  namespace: ArbitraryNamespace,
): Set<Arbitrary> => {
  const arbitraryReferenceCounts = new Map<Arbitrary, number>()
  const arbitraryDependencies = new Map<Arbitrary, Set<Arbitrary>>()

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

      const dependencies = getDirectArbitraryDependencies(arbitrary)
      arbitraryDependencies.set(arbitrary, dependencies)

      for (const referencedArbitrary of dependencies) {
        remainingArbitraries.push(referencedArbitrary)
        arbitraryReferenceCounts.set(
          referencedArbitrary,
          (arbitraryReferenceCounts.get(referencedArbitrary) ?? 0) + 1,
        )
      }
    }
  } while (remainingNamespaces.length > 0)

  const sharedArbitraryDependencyGraph = pipe(
    arbitraryDependencies,
    flatMap(
      ([arbitrary, dependencies]): Iterable<
        [Arbitrary, Arbitrary | undefined]
      > =>
        dependencies.size === 0
          ? [[arbitrary, undefined]]
          : pipe(
              dependencies,
              values,
              map((dependency): [Arbitrary, Arbitrary] => [
                arbitrary,
                dependency,
              ]),
            ),
    ),
    reduce(toArray()),
  )

  return pipe(
    toposort(sharedArbitraryDependencyGraph).reverse(),
    filter(arbitrary => (arbitraryReferenceCounts.get(arbitrary) ?? 0) >= 2),
    reduce(toSet()),
  )
}

const getDirectArbitraryDependencies = (
  arbitrary: Arbitrary,
): Set<Arbitrary> => {
  switch (arbitrary.type) {
    case `record`:
      return new Set(values(arbitrary.properties))
    case `dictionary`:
      return new Set([arbitrary.key, arbitrary.value])
    case `array`:
      return new Set([arbitrary.value])
    case `union`:
      return new Set(arbitrary.variants)
    case `enum`:
    case `boolean`:
    case `integer`:
    case `big-integer`:
    case `float`:
    case `string`:
      return new Set()
  }
}

export default convertProgram
