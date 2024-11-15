/* eslint-disable new-cap */
import { entries, filter, map, pipe, reduce, toArray } from 'lfi'
import * as ay from '@alloy-js/core/stc'
import * as ts from '@alloy-js/typescript/stc'
import { join as ayJoin, code } from '@alloy-js/core'
import type { Child, Refkey } from '@alloy-js/core'
import type {
  Arbitrary,
  ArbitraryNamespace,
  ArrayArbitrary,
  BigIntegerArbitrary,
  DictionaryArbitrary,
  EnumArbitrary,
  FloatArbitrary,
  IntegerArbitrary,
  RecordArbitrary,
  StringArbitrary,
  UnionArbitrary,
} from './arbitrary.ts'

const ArbitraryFile = ({
  namespace,
  sharedArbitraries,
}: {
  namespace: ArbitraryNamespace
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  ay.Output().children(ts.SourceFile({ path: `arbitraries.js` }).code`
    import * as fc from 'fast-check'

    ${ArbitraryNamespace({ namespace, sharedArbitraries })}
  `)

const ArbitraryNamespace = ({
  namespace,
  sharedArbitraries,
}: {
  namespace: ArbitraryNamespace
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child => {
  if (!namespace.name) {
    return TopLevelArbitraryNamespace({ namespace, sharedArbitraries })
  }

  return ts.ObjectExpression().children(
    ayJoin(
      [
        ...map(
          namespace =>
            ts.ObjectProperty({
              name: namespace.name,
              value: code`${ArbitraryNamespace({ namespace, sharedArbitraries })},`,
            }),
          namespace.namespaces,
        ),
        ...map(
          ([name, arbitrary]) =>
            ts.ObjectProperty({
              name,
              value: code`${Arbitrary({ arbitrary, sharedArbitraries })},`,
            }),
          entries(namespace.nameToArbitrary),
        ),
      ],
      { joiner: `\n\n` },
    ),
  )
}

const TopLevelArbitraryNamespace = ({
  namespace,
  sharedArbitraries,
}: {
  namespace: ArbitraryNamespace
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  ayJoin(
    [
      ...map(
        ([arbitrary, refkey]) =>
          ts.VarDeclaration({
            export: namespace.arbitraryToName.has(arbitrary),
            const: true,
            name: namespace.arbitraryToName.get(arbitrary) ?? arbitrary.name,
            refkey,
            value: ArbitraryDefinition({ arbitrary, sharedArbitraries }),
          }),
        entries(sharedArbitraries),
      ),
      ...map(
        namespace =>
          ts.VarDeclaration({
            export: true,
            const: true,
            name: namespace.name,
            value: ArbitraryNamespace({ namespace, sharedArbitraries }),
          }),
        namespace.namespaces,
      ),
      ...pipe(
        entries(namespace.nameToArbitrary),
        filter(([, arbitrary]) => !sharedArbitraries.has(arbitrary)),
        map(([name, arbitrary]) =>
          ts.VarDeclaration({
            export: true,
            const: true,
            name,
            value: Arbitrary({ arbitrary, sharedArbitraries }),
          }),
        ),
      ),
    ],
    { joiner: `\n\n` },
  )

const Arbitrary = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: Arbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  sharedArbitraries.get(arbitrary) ??
  ArbitraryDefinition({ arbitrary, sharedArbitraries })

const ArbitraryDefinition = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: Arbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child => {
  switch (arbitrary.type) {
    case `boolean`:
      return `fc.boolean()`
    case `record`:
      return RecordArbitrary({ arbitrary, sharedArbitraries })
    case `dictionary`:
      return DictionaryArbitrary({ arbitrary, sharedArbitraries })
    case `array`:
      return ArrayArbitrary({ arbitrary, sharedArbitraries })
    case `union`:
      return UnionArbitrary({ arbitrary, sharedArbitraries })
    case `enum`:
      return EnumArbitrary({ arbitrary })
    case `integer`:
      return IntegerArbitrary({ arbitrary })
    case `big-integer`:
      return BigIntegerArbitrary({ arbitrary })
    case `float`:
      return FloatArbitrary({ arbitrary })
    case `string`:
      return StringArbitrary({ arbitrary })
  }
}

const RecordArbitrary = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: RecordArbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  code`fc.record(${ts.ObjectExpression().children(
    ayJoin(
      pipe(
        arbitrary.properties,
        map(
          ([name, arbitrary]) =>
            code`${ts.ObjectProperty({
              name,
              value: Arbitrary({ arbitrary, sharedArbitraries }),
            })},`,
        ),
        reduce(toArray()),
      ),
    ),
  )})`

const DictionaryArbitrary = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: DictionaryArbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  code`fc.dictionary(${Arbitrary({
    arbitrary: arbitrary.key,
    sharedArbitraries,
  })}, ${Arbitrary({
    arbitrary: arbitrary.value,
    sharedArbitraries,
  })})`

const ArrayArbitrary = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: ArrayArbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  code`fc.array(${Arbitrary({ arbitrary: arbitrary.value, sharedArbitraries })})`

const UnionArbitrary = ({
  arbitrary,
  sharedArbitraries,
}: {
  arbitrary: UnionArbitrary
  sharedArbitraries: Map<Arbitrary, Refkey>
}): Child =>
  code`fc.oneof(\n${ay
    .Indent()
    .children(
      ayJoin(
        arbitrary.variants.map(
          variant =>
            code`${Arbitrary({ arbitrary: variant, sharedArbitraries })},`,
        ),
      ),
    )}\n)`

const EnumArbitrary = ({ arbitrary }: { arbitrary: EnumArbitrary }): Child =>
  code`fc.constantFrom(${arbitrary.values.join(`, `)})`

const IntegerArbitrary = ({
  arbitrary,
}: {
  arbitrary: IntegerArbitrary
}): Child =>
  code`fc.integer(${ts
    .ObjectExpression()
    .children(
      ayJoin([
        code`${ts.ObjectProperty({ name: `min`, jsValue: arbitrary.min })},`,
        code`${ts.ObjectProperty({ name: `max`, jsValue: arbitrary.max })},`,
      ]),
    )})`

const BigIntegerArbitrary = ({
  arbitrary,
}: {
  arbitrary: BigIntegerArbitrary
}): Child => {
  const properties = [
    arbitrary.min !== undefined &&
      code`${ts.ObjectProperty({ name: `min`, value: `${arbitrary.min}n` })},`,
    arbitrary.max !== undefined &&
      code`${ts.ObjectProperty({ name: `max`, value: `${arbitrary.max}n` })},`,
  ].filter(Boolean)
  if (properties.length === 0) {
    return `fc.bigInt()`
  }

  return code`fc.bigInt(${ts.ObjectExpression().children(ayJoin(properties))})`
}

const FloatArbitrary = ({
  arbitrary,
}: {
  arbitrary: FloatArbitrary
}): Child => {
  const properties = [
    arbitrary.min !== undefined &&
      code`${ts.ObjectProperty({ name: `min`, jsValue: arbitrary.min })},`,
    arbitrary.max !== undefined &&
      code`${ts.ObjectProperty({ name: `max`, jsValue: arbitrary.max })},`,
  ].filter(Boolean)
  if (properties.length === 0) {
    return `fc.float()`
  }

  return code`fc.float(${ts.ObjectExpression().children(ayJoin(properties))})`
}

const StringArbitrary = ({
  arbitrary,
}: {
  arbitrary: StringArbitrary
}): Child => {
  const properties = [
    arbitrary.minLength !== undefined &&
      code`${ts.ObjectProperty({ name: `minLength`, jsValue: arbitrary.minLength })},`,
    arbitrary.maxLength !== undefined &&
      code`${ts.ObjectProperty({ name: `maxLength`, jsValue: arbitrary.maxLength })},`,
  ].filter(Boolean)
  if (properties.length === 0) {
    return `fc.string()`
  }

  return code`fc.string(${ts.ObjectExpression().children(ayJoin(properties))})`
}

export default ArbitraryFile
