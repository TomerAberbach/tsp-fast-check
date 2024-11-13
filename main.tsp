import "./dist/src/index.js";
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
    name: string,
    age: int32,
  },
  shepherd: {
    name2: string,
    age: int32,
  },
  retriever: {
    name3: string,
    age: int32,
  },
}

model Blah {
  name: string;
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
      name: string;
    }

    @post
    op create(@body pet: Pet): {
      @statusCode statusCode: 201;
      @body toy: Toy;
    };
  }
}
