import { createTypeSpecLibrary } from '@typespec/compiler'

export const $lib = createTypeSpecLibrary({
  name: `tsp-fast-check`,
  diagnostics: {},
})

// eslint-disable-next-line typescript/unbound-method
export const { reportDiagnostic, createDiagnostic } = $lib
