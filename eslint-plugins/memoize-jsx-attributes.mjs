import { AST_NODE_TYPES } from '@typescript-eslint/types'

// #region 4.2. Helper functions
/**
 * @typedef {import('estree').ArrowFunctionExpression | import('estree').FunctionDeclaration | import('estree').ClassDeclaration} ReactComponentNode
 */

/**
 * Finds the nearest component parent of a given node that is a React component,
 * whether function component or class component. Returns null if no parent is
 * found.
 * @param {import('estree').Node} node
 * @returns {ReactComponentNode | null}
 */
function findNearestComponentParent(node) {
  let currentParent = node.parent
  while (currentParent) {
    switch (currentParent.type) {
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionDeclaration:
        // When the parent of a function is a JSXExpressionContainer, it means
        // it's a JSX attribute value, so we need to go up one more level to
        // find the true parent.
        if (currentParent.parent?.type === AST_NODE_TYPES.JSXExpressionContainer) {
          currentParent = currentParent.parent?.parent
          continue
        }
        return currentParent
      case AST_NODE_TYPES.ClassDeclaration:
        return currentParent
    }
    currentParent = currentParent.parent
  }
  return null
}

/**
 * Extracts the name of a React component from a given component node. Depending
 * on the node type, the name can be different:
 * - ArrowFunctionExpression: the name is the variable name of the parent variable declaration
 * - FunctionDeclaration: the name is the name of the function
 * - ClassDeclaration: the name is the name of the class
 * @param {ReactComponentNode} componentNode
 * @returns {string | null}
 */
function getReactComponentName(componentNode) {
  switch (componentNode.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
      if (
        componentNode.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        componentNode.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return componentNode.parent.id.name
      } else {
        return null
      }
    case AST_NODE_TYPES.FunctionDeclaration:
      return componentNode.id?.name ?? null
    case AST_NODE_TYPES.ClassDeclaration:
      return componentNode.id?.name ?? null
    default:
      return null
  }
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.JSXExpressionContainer} node
 * @returns {string | null}
 */
function getAttributeName(node) {
  if (node.parent?.type !== AST_NODE_TYPES.JSXAttribute || node.parent?.name?.type !== AST_NODE_TYPES.JSXIdentifier) {
    return null
  }
  return node.parent.name.name
}

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function lowercaseFirstCharacter(string) {
  return string.charAt(0).toLowerCase() + string.slice(1)
}
// #endregion 4.2. Helper functions

// #region 1. Basic plugin structure
/** @type {import('eslint').Rule.RuleModule} */
const memoizeJsxAttributes = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce JSX attribute memoization for non-primitive values',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
  },
  create(context) {
    return {
      // #region 2. JSXExpressionContainer visitor
      /**
       * @param {import('@typescript-eslint/types').TSESTree.JSXExpressionContainer} node
       */
      JSXExpressionContainer(node) {
        const expressionType = node.expression.type

        // #region 3. Check for unstable references
        // Only check for types whose references are unstable:
        // - Array literals
        // - Object literals
        // - Function expressions
        if (
          ![
            AST_NODE_TYPES.ArrayExpression,
            AST_NODE_TYPES.ObjectExpression,
            AST_NODE_TYPES.ArrowFunctionExpression,
          ].includes(expressionType)
        ) {
          return
        }
        // #endregion 3. Check for unstable references

        // #region 4.1. Collecting information
        const parentComponentNode = findNearestComponentParent(node)
        // Only memoize values inside function components
        if (!parentComponentNode || parentComponentNode.type === AST_NODE_TYPES.ClassDeclaration) {
          return
        }

        // Infer the name to be given to the memoized value by
        // looking at the containing component's name, the JSX element
        // where the attribute is specified, and the attribute name.
        // These 3 values will be used to generate a camel-cased name
        // for the memoized value.
        const componentName = getReactComponentName(parentComponentNode)
        const renderedElementName =
          (node.parent?.parent?.type === AST_NODE_TYPES.JSXOpeningElement && node.parent?.parent?.name.name) || null
        const attributeName = getAttributeName(node)

        // #endregion 4.1. Collecting information

        // #region 5. Reporting
        /**
         * @param {{
         *  valueNode: import('estree').Node
         *  message?: string
         *  desc?: string
         *  generateMemoName?: (componentName: string | null, renderedElementName: string | null, attributeName: string | null) => string
         *  mechanism?: 'useMemo' | 'useCallback'
         * }} info
         */
        function reportWithInfo(info) {
          const {
            valueNode,
            message = 'Values with unstable references should be memoized',
            desc = 'Declare the value in a `useMemo()`',
            generateMemoName = (_componentName, renderedElementName, attributeName) => {
              return renderedElementName || attributeName
                ? lowercaseFirstCharacter([renderedElementName, attributeName].filter(Boolean).map(capitalize).join(''))
                : 'memoizedValue'
            },
            mechanism = 'useMemo',
          } = info

          context.report({
            node: node.expression,
            message,
            suggest: [
              {
                desc,
                fix(fixer) {
                  // #region 8. Code to fix
                  const memoName = generateMemoName(componentName, renderedElementName, attributeName)
                  const memoContent =
                    mechanism === 'useCallback'
                      ? `useCallback(${context.sourceCode.getText(valueNode)}, [])`
                      : `useMemo(() => ${context.sourceCode.getText(valueNode)}, [])`

                  // Next, find the appropriate place to insert the `useMemo()`
                  // declaration. Usually, that's right before the return
                  // statement of the containing component.
                  const returnStatement =
                    parentComponentNode?.body.type === AST_NODE_TYPES.BlockStatement
                      ? parentComponentNode.body.body.find((node) => node.type === AST_NODE_TYPES.ReturnStatement)
                      : null

                  if (returnStatement) {
                    return [
                      // Add the `useMemo()` declaration before the return statement
                      fixer.insertTextBefore(returnStatement, `const ${memoName} = ${memoContent}\n`),
                      // Replace the expression with the memoized value
                      fixer.replaceText(node.expression, memoName),
                    ]
                  }

                  // If no return statement is found, check if the parent
                  // component exists first. If it doesn't, just inline the memo
                  // and let the user fix it manually later.
                  if (!parentComponentNode) {
                    return fixer.replaceText(node.expression, memoContent)
                  }

                  // Now we have a containing component but no return statement.
                  // Usually, this means the component is an arrow function
                  // component that returns JSX directly. We can wrap the JSX in a
                  // block.
                  const bodyText = context.sourceCode.getText(parentComponentNode.body)
                  const [expStart, expEnd] = node.expression.range
                  const bodyStart = parentComponentNode.body.range[0]
                  const bodyTextBeforeValue = bodyText.slice(0, expStart - bodyStart)
                  const bodyTextAfterValue = bodyText.slice(expEnd - bodyStart)
                  const returnContent = `${bodyTextBeforeValue}${memoName}${bodyTextAfterValue}`

                  return fixer.replaceText(
                    parentComponentNode.body,
                    `{
  const ${memoName} = ${memoContent}
  return (
    ${returnContent}
  )
}`,
                  )
                  // #endregion 8. Code to fix
                },
              },
            ],
          })
        }
        // #endregion 5. Reporting

        // #region 6. Report based on the type of the expression
        switch (node.expression.type) {
          case AST_NODE_TYPES.ArrayExpression: {
            reportWithInfo({
              valueNode: node.expression,
              message: 'Array attributes should be memoized',
              desc: 'Declare the array in a `useMemo()`',
            })
            break
          }
          case AST_NODE_TYPES.ArrowFunctionExpression: {
            reportWithInfo({
              valueNode: node.expression,
              message: 'Function attributes should be memoized',
              desc: 'Declare the function in a `useCallback()`',
              generateMemoName: (_componentName, renderedElementName, attributeName) => {
                if (!attributeName) return 'memoizedFunction'
                if (/^on[A-Z]/.test(attributeName)) {
                  return `handle${renderedElementName ?? ''}${attributeName.slice(2)}`
                }
                return `${lowercaseFirstCharacter(renderedElementName ?? '')}${attributeName}`
              },
              mechanism: 'useCallback',
            })
            break
          }
        }
        // #endregion 6. Report based on the type of the expression
      },
      // #endregion 2. JSXExpressionContainer visitor
    }
  },
}

export default {
  'memoize-jsx-attributes': memoizeJsxAttributes,
}
// #endregion 1. Basic plugin structure
