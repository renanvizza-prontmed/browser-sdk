import { catchUserErrors } from './catchUserErrors'

describe('catchUserErrors', () => {
  it('returns the same result as the original function', () => {
    const wrappedFn = catchUserErrors((a: number, b: number) => a + b, 'Error during callback')
    expect(wrappedFn(10, 2)).toBe(12)
  })

  it('logs errors using console.error and returns undefined', () => {
    const consoleErrorSpy = spyOn(console, 'error')
    const myError = 'Ooops!'
    const wrappedFn = catchUserErrors(() => {
      throw myError
    }, 'Error during callback')
    expect(wrappedFn()).toBe(undefined)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during callback', myError)
  })
})
