import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { ESLintUtils } from '@typescript-eslint/utils'
import ts from 'typescript'

// #region 1. Rule definition
/** @type {import('eslint').Rule.RuleModule} */
const noUnstableComputedValue = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce stable values in `computed` calls',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
  },
  create(context) {
    // #region 3.1. Declare TypeScript services
    const parserServices = ESLintUtils.getParserServices(context)
    const checker = parserServices.program.getTypeChecker()
    // #endregion 3.1. Declare TypeScript services

    return {
      CallExpression(node) {
        // #region 2. Verify `computed(() => {})` node identity
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== 'computed' ||
          node.arguments.length !== 1
        ) {
          return
        }
        const [funcExp] = node.arguments
        if (funcExp.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
          return
        }
        // #endregion 2. Verify `computed(() => {})` node identity

        // #region 6. Avoid running the rule on fixed computed calls
        // If the function expression already contains an argument, we recognize
        // it as already checking and returning a stable value

        // TODO: Uncomment the following line
        // if (funcExp.params.length > 0) return

        // #endregion 6. Avoid running the rule on fixed computed calls

        // #region 3.2. Verify object return type
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(funcExp)
        const type = checker.getTypeAtLocation(tsNode)
        const signature = type.getCallSignatures()[0]
        if (!signature) return
        const returnType = checker.getReturnTypeOfSignature(signature)

        const isObject = returnType.flags & ts.TypeFlags.Object
        const isArray = returnType.flags & ts.ObjectFlags.ArrayLiteral

        // We only process objects for now
        if (!isObject || isArray) return
        // #endregion 3.2. Verify object return type

        // #region 4. Extract the return statement
        // Get the return statement of the function
        /** @type {import('@typescript-eslint/types').TSESTree.ReturnStatement | undefined} */
        const returnStatement = funcExp.body.body?.find(
          (statement) => statement.type === AST_NODE_TYPES.ReturnStatement,
        )

        // Only process if there is a return statement with a value
        // TODO: Also check for () => ({}) syntax
        if (!returnStatement || !returnStatement.argument) return
        // #endregion 4. Extract the return statement

        // #region 5. Check for stable references
        const properties = returnType.getProperties()
        const returnTypeText = checker.typeToString(returnType)

        context.report({
          node,
          message: 'Computed object values should return stable references.',
          suggest: [
            {
              desc: 'Compare with old value and retain it if nothing changed',
              fix(fixer) {
                return fixer.replaceText(
                  node,
                  `computed<${returnTypeText}>((oldValue) => {
  const newValue = ${context.sourceCode.getText(returnStatement.argument)}
  if (oldValue && ${properties.map((p) => `oldValue.${p.name} === newValue.${p.name}`).join(' && ')}) {
    return oldValue
  }
  return newValue
})`,
                )
              },
            },
          ],
        })
        // #endregion 5. Check for stable references
      },
    }
  },
}

export default {
  'no-unstable-computed-value': noUnstableComputedValue,
}
// #endregion 1. Rule definition
