const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const generate = require('@babel/generator').default
const t = require('@babel/types')

module.exports = function (source) {

  var fileName = this.resourcePath
    .match(/(?<=(\/|\\))[^(\/|\\)]+?\.young$/)[0]
    .replace(/\.young$/, '')

  var componentName = fileName[0].toUpperCase() + fileName.slice(1)

  var tree = parser.parse(source, {
    plugins: ['jsx'],
    sourceType: 'module',
  })

  /**
   * gn = global Identifier Name
   */
  var gn = {
    DATA: '$_data',
    RENDER: '$_render',
    REACTIVE: '$_reactive',
    CREATEELEMENT: '$_createElement'
  }

  var programPath
  var dataPathNodes = []
  var rootFunctionBlockPathNode
  var mountElement
  var jsxs = []
  var effectCalls = []
  var reactiveIdentifiers = []
  var labelPropertyPathNodes = []
  var requireIdentifiers = [
    { raw: 'createElement', as: gn.CREATEELEMENT },
    { raw: 'reactive', as: gn.REACTIVE },
  ]
  var mount = { raw: 'render', as: '$_render' }
  var youngPath = 'young.js'

  traverse(tree, {
    LabeledStatement(path) {
      if (path.node.label.name === 'props') {
        path.traverse({
          Identifier(path) {
            if (path.node.name === 'props') return
            labelPropertyPathNodes.push(
              t.objectProperty(
                path.node,
                path.node
              )
            )
          }
        })
        path.remove()
      }
      else if (path.node.label.name === '$') {
        path.traverse({
          AssignmentExpression(path) {
            if (path.node.operator !== '=') return
            reactiveIdentifiers.push(path.node.left.name)
            dataPathNodes.push(
              t.objectProperty(
                path.node.left,
                path.node.right
              )
            )
          }
        })
        path.remove()
      }
      path.skip()
    },
    JSXFragment(path) {
      if (path.parentPath.node.type === 'ExpressionStatement') {
        jsxs.push(t.returnStatement(path.node))
        path.remove()
      }
    },
    JSXElement(path) {
      if (path.parentPath.node.type === 'ExpressionStatement') {
        jsxs.push(t.returnStatement(path.node))
        path.remove()
      }
    },
    CallExpression(path) {
      if (path.node.callee.name === 'Effect') {
        effectCalls.push(path.node)
        path.remove()
      }
    }
  })

  traverse(tree, {
    Program(path) {
      programPath = path
      path.node.body.push(
        t.importDeclaration(
          requireIdentifiers.map(i => {
            return t.importSpecifier(
              t.identifier(i.as),
              t.identifier(i.raw)
            )
          }),
          t.stringLiteral(youngPath)
        ),
        t.variableDeclaration(
          'var',
          [t.variableDeclarator(
            t.identifier(gn.DATA)
          )]
        ),
        t.exportDefaultDeclaration(
          t.functionDeclaration(
            t.identifier(componentName),
            [t.assignmentPattern(
              t.objectPattern(labelPropertyPathNodes),
              t.objectExpression([])
            )],
            rootFunctionBlockPathNode = t.blockStatement([])
          )
        )
      )
    },
    BlockStatement(path) {
      if (path.node === rootFunctionBlockPathNode) {
        path.node.body.unshift(
          t.assignmentExpression(
            '=',
            t.identifier(gn.DATA),
            t.callExpression(
              t.identifier(gn.REACTIVE),
              [t.objectExpression(dataPathNodes)]
            )
          ),
          ...effectCalls,
          ...jsxs
        )
      }
    }
  })

  traverse(tree, {
    Identifier(path) {
      if (!reactiveIdentifiers.includes(path.node.name)) return
      if (path.parentPath?.parentPath.node.properties === dataPathNodes) return

      path.replaceWith(t.identifier(`${gn.DATA}.${path.node.name}`))
      path.skip()
    },
    JSXElement(path) {
      const { openingElement } = path.node
      const { children } = path.node
      const { name: { name: tag }, attributes } = openingElement
      const filteredChildren = filterJSXTextOrChildren(children)
      const expression = t.callExpression(
        t.identifier(gn.CREATEELEMENT),
        [
          isComponent(tag) ? t.identifier(tag) : t.stringLiteral(tag),
          t.objectExpression(
            attributes.map(({ name: { name: key }, value }) => {
              return t.objectProperty(
                t.identifier(key),
                t.isJSXExpressionContainer(value) ? value.expression : value
              )
            })
          ),
          t.arrayExpression(filteredChildren)
        ])
      path.replaceWith(expression)
    },
    CallExpression(path) {
      if (path.node.callee.name === 'Young') {
        programPath.node.body.push(
          t.importDeclaration(
            [t.importSpecifier(
              t.identifier(mount.as),
              t.identifier(mount.raw)
            )],
            t.stringLiteral(youngPath)
          )
        )
        mountElement = path.node.arguments[0]
        path.parentPath.replaceWith(
          t.expressionStatement(
            t.callExpression(
              t.identifier(mount.as),
              [
                t.callExpression(
                  t.identifier(gn.CREATEELEMENT),
                  [
                    t.identifier(componentName),
                    t.objectExpression([]),
                    t.arrayExpression([])
                  ]
                ),
                t.callExpression(
                  t.memberExpression(
                    t.identifier('document'),
                    t.identifier('querySelector')
                  ),
                  [mountElement]
                )
              ]
            )
          )
        )
      }
    }
  })

  function filterJSXTextOrChildren(children) {
    return children.map(item => {
      if (!item.expression) {
        return !t.isJSXText(item) ?
          item : /[^\n\s]/.test(item.value) ?
            t.stringLiteral(item.value) : 'Invalid Text'
      } else {
        var callPathNode, menberPathNode
        if (
          t.isCallExpression(callPathNode = item.expression) &&
          t.isMemberExpression(menberPathNode = callPathNode.callee) &&
          ['map', 'filter'].includes(menberPathNode.property.name)
        ) {
          return t.spreadElement(item.expression)
        }
        else if (
          t.isLogicalExpression(item.expression) ||
          t.isConditionalExpression(item.expression)
        ) {
          return t.callExpression(
            t.arrowFunctionExpression([], item.expression), []
          )
        }
        return item.expression
      }
    }).filter(i => i !== 'Invalid Text')
  }

  function isComponent(tag) { return tag[0] === tag[0].toUpperCase() }

  const processedSource = generate(tree).code

  return processedSource
}
