import "./dist/index.js";
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";
import "@typespec/http";

using TypeSpec.Http;

@service({
  title: "Pet Store",
})
@server("https://example.com", "Single server endpoint")
namespace PetStore;

union Breed {
  beagle: {
    int64: int64,
    integer: integer,
    name: string,
    name2: string[],
    age: int32,
    blah: boolean,
    blah2: float32,
  },
  shepherd: {
    name2: string,
    age: int32,
    age2: int16,
  },
  retriever: {
    name3: string,
  },
}

model Blah {
  name: string;
}

namespace Pets2 {
  model Pet {
    breed: Breed;
    id: int32;

    @minLength(1)
    @maxLength(4)
    name: string;

    @minValue(0)
    @maxValue(100)
    age: int32;

    kind: petType;
  }

  enum petType {
    dog: "dog",
    cat: "cat",
    fish: "fish",
    bird: "bird",
  }
}

@route("/pets")
namespace Pets {
  model Pet {
    breed: Breed;
    id: int32;

    @minLength(1)
    @maxLength(4)
    name: string;

    @minValue(0)
    @maxValue(100)
    age: int32;

    kind: petType;
  }

  enum petType {
    dog: "dog",
    cat: "cat",
    fish: "fish",
    bird: "bird",
    reptile: "reptile",
  }

  @get
  op list(): {
    @statusCode statusCode: 200;
    @body pets: Pet[];
  };

  @get
  op get(@path petId: int32): {
    @statusCode statusCode: 200;
    @body pet: Pet;
  };

  @post
  op create(@body pet: Pet): {
    @statusCode statusCode: 201;
    @body newPet: Pet;
  };

  @put
  op update(@path petId: int32, @body pet: Pet): {
    @statusCode statusCode: 200;
    @body updatedPet: Pet;
  };

  @delete
  op delete(@path petId: int32): {
    @statusCode statusCode: 204;
  };

  @route("/toys")
  namespace Toys {
    model Toy {
      name: int16;
    }

    @post
    op create(@body pet: Pet): {
      @statusCode statusCode: 201;
      @body toy: Toy;
    };
  }
}
