export type ArbitraryNamespace = {
  name: string
  namespaces: ArbitraryNamespace[]
  nameToArbitrary: Map<string, Arbitrary>
  arbitraryToName: Map<Arbitrary, string>
}

export type Arbitrary = BaseArbitrary &
  (
    | RecordArbitrary
    | DictionaryArbitrary
    | ArrayArbitrary
    | UnionArbitrary
    | EnumArbitrary
    | BooleanArbitrary
    | IntegerArbitrary
    | BigIntegerArbitrary
    | FloatArbitrary
    | StringArbitrary
  )

export type BaseArbitrary = {
  name: string
}

export type RecordArbitrary = {
  type: `record`
  properties: Map<string, Arbitrary>
}

export type DictionaryArbitrary = {
  type: `dictionary`
  key: Arbitrary
  value: Arbitrary
}

export type ArrayArbitrary = {
  type: `array`
  value: Arbitrary
}

export type UnionArbitrary = {
  type: `union`
  variants: Arbitrary[]
}

export type EnumArbitrary = {
  type: `enum`
  values: string[]
}

export type BooleanArbitrary = {
  type: `boolean`
}

export type IntegerArbitrary = {
  type: `integer`
  min: number
  max: number
}

export type BigIntegerArbitrary = {
  type: `big-integer`
  min?: bigint
  max?: bigint
}

export type FloatArbitrary = {
  type: `float`
  min?: number
  max?: number
}

export type StringArbitrary = {
  type: `string`
  minLength?: number
  maxLength?: number
}
