import { getSyntheticsResultId, getSyntheticsTestId, willSyntheticsInjectRum } from '@renanvizza-prontmed/browser-core'

export function getSyntheticsContext() {
  const testId = getSyntheticsTestId()
  const resultId = getSyntheticsResultId()

  if (testId && resultId) {
    return {
      test_id: testId,
      result_id: resultId,
      injected: willSyntheticsInjectRum(),
    }
  }
}
