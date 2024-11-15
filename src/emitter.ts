/* eslint-disable new-cap */
import type { EmitContext } from '@typespec/compiler'
import { emitFile, resolvePath } from '@typespec/compiler'
import { render } from '@alloy-js/core'
import type { OutputFile } from '@alloy-js/core'
import convertProgram from './convert.ts'
import ArbitraryFile from './components.ts'

export async function $onEmit(context: EmitContext): Promise<void> {
  if (context.program.compilerOptions.noEmit) {
    return
  }

  const { path, contents } = render(
    ArbitraryFile(convertProgram(context.program)),
  ).contents[0]! as OutputFile
  await emitFile(context.program, {
    path: resolvePath(context.emitterOutputDir, path),
    content: contents,
  })
}
