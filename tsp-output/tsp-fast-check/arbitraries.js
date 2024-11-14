import * as fc from "fast-check";

const String = fc.string();

const PetType = fc.constantFrom("dog", "cat", "fish", "bird", "reptile");

const Int32 = fc.integer({
  min: -2147483648,
  max: 2147483647,
});

const Retriever = fc
  .tuple(
    fc.dictionary(String, String),
    fc.record({
      name3: String,
    }),
  )
  .map(([dictionary, record]) => ({ ...dictionary, ...record }));

const Int16 = fc.integer({
  min: -32768,
  max: 32767,
});

const Shepherd = fc.record({
  name2: String,
  age: Int32,
  age2: Int16,
});

const Record = fc.dictionary(String, String);

const Float64 = fc.double();

const Float32 = fc.float();

const Blah = fc.boolean();

const Array = fc.array(String);

const Bytes = fc.int8Array();

const Url = fc.webUrl();

const Decimal = fc.double();

const Integer = fc.bigInt();

const Int64 = fc.bigInt({
  min: -9223372036854775808n,
  max: 9223372036854775807n,
});

const Beagle = fc.record({
  int64: Int64,
  integer: Integer,
  decimal: Decimal,
  url: Url,
  bytes: Bytes,
  name: String,
  name2: Array,
  age: Int32,
  blah: Blah,
  blah2: Float32,
  blah3: Float64,
  blah4: Record,
});

const Breed = fc.oneof(Beagle, Shepherd, Retriever);

export const PetStore = {
  Pets: {
    Toys: {
      Toy: fc.record({
        name: String,
      }),
    },

    Pet: fc.record({
      breed: Breed,
      id: Int32,
      name: fc.string({
        minLength: 1,
        maxLength: 4,
      }),
      age: fc.integer({
        min: 0,
        max: 100,
      }),
      kind: PetType,
    }),

    petType: PetType,
  },

  Blah: fc.record({
    name: String,
  }),

  Breed: Breed,
};
