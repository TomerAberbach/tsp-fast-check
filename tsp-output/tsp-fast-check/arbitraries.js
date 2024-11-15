import * as fc from 'fast-check'

const PetType = fc.constantFrom(`dog`, `cat`, `fish`, `bird`)

const string = fc.string({
  minLength: 1,
  maxLength: 4,
})

const int32 = fc.integer({
  min: -2_147_483_648,
  max: 2_147_483_647,
})

const string_2 = fc.string()

const Retriever = fc.record({
  name3: string_2,
})

const int16 = fc.integer({
  min: -32_768,
  max: 32_767,
})

const Shepherd = fc.record({
  name2: string_2,
  age: int32,
  age2: int16,
})

const float32 = fc.float()

const blah = fc.boolean()

const Array = fc.record({})

const integer = fc.bigInt()

const int64 = fc.bigInt({
  min: -9_223_372_036_854_775_808n,
  max: 9_223_372_036_854_775_807n,
})

const Beagle = fc.record({
  int64,
  integer,
  name: string_2,
  name2: Array,
  age: int32,
  blah,
  blah2: float32,
})

const Breed = fc.oneof(Beagle, Shepherd, Retriever)

const PetType_2 = fc.constantFrom(`dog`, `cat`, `fish`, `bird`, `reptile`)

export const PetStore = {
  Pets2: {
    Pet: fc.record({
      breed: Breed,
      id: int32,
      name: string,
      age: int32,
      kind: PetType,
    }),

    petType: PetType,
  },

  Pets: {
    Toys: {
      Toy: fc.record({
        name: int16,
      }),
    },

    Pet: fc.record({
      breed: Breed,
      id: int32,
      name: string,
      age: int32,
      kind: PetType_2,
    }),

    petType: PetType_2,
  },

  Blah: fc.record({
    name: string_2,
  }),

  Breed,
}
