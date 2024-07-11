import memoizeJsxAttributes from './memoize-jsx-attributes.mjs'
import noUnstableComputedValue from './no-unstable-computed-value.mjs'

export default {
  rules: {
    ...memoizeJsxAttributes,
    ...noUnstableComputedValue,
  },
}
