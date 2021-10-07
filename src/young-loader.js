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
  var newFunctionParam
  var rootFunctionBlockPathNode
  var withBlockStatementPathNode
  var tempBlockStatementPathNode
  var mountElement
  var propKeys = []
  var components = []
  var otherIdentifiers = []
  var labelPropertyPathNodes = []
  var functionDeclaration = []
  var golobalIdentifiers = Object.values(gn)
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
            propKeys.push(path.node.name)
          }
        })
        path.remove()
      }
      else if (path.node.label.name === '$') {
        path.traverse({
          AssignmentExpression(path) {
            if (path.node.operator !== '=') return
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
    JSXElement(path) {
      const { openingElement } = path.node
      const { name: { name: tag } } = openingElement
      isComponent(tag) && components.push(tag)
    },
    VariableDeclaration(path) {
      if (golobalIdentifiers.includes(path.node.declarations[0].id.name)) return

      if (path.parentPath.isProgram()) {
        const { id, init } = path.node.declarations[0]
        if (t.isArrowFunctionExpression(init)) {
          withBlockStatementPathNode.body.unshift(path.node)
          path.remove()
        }
        else if (t.isCallExpression(init) && init.callee.name === 'require') {
          path.skip()
        }
        else {
          otherIdentifiers.push(id.name)
        }
      }
    },
  })

  traverse(tree, {
    Program(path) {
      programPath = path
      path.node.body.unshift(
        t.importDeclaration(
          requireIdentifiers.map(i => {
            return t.importSpecifier(
              t.identifier(i.as),
              t.identifier(i.raw)
            )
          }),
          t.stringLiteral(youngPath)
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
      if (path.node === withBlockStatementPathNode) {
        programPath.traverse({
          JSXFragment(path2) {
            addToWithBlockPath(withBlockStatementPathNode, path2)
            path2.remove()
          },
          JSXElement(path2) {
            addToWithBlockPath(withBlockStatementPathNode, path2)
            path2.remove()
          },
        })
      }
      if (path.node === rootFunctionBlockPathNode) {
        path.node.body.unshift(
          t.variableDeclaration(
            'var',
            [t.variableDeclarator(
              t.identifier(gn.RENDER),
              t.newExpression(
                t.identifier('Function'),
                newFunctionParam = []
              )
            )]
          ),
          t.variableDeclaration(
            'var',
            [t.variableDeclarator(
              t.identifier(gn.DATA),
              t.callExpression(
                t.identifier(gn.REACTIVE),
                [t.objectExpression(dataPathNodes)]
              ),
            )]
          ),
          t.returnStatement(
            t.callExpression(
              t.identifier(gn.RENDER),
              [
                t.identifier(gn.DATA),
                t.identifier(gn.CREATEELEMENT),
                ...components.map(i => t.identifier(i)),
                ...propKeys.map(i => t.identifier(i)),
                ...otherIdentifiers.map(i => t.identifier(i)),
              ]
            )
          ),
          tempBlockStatementPathNode = t.blockStatement([
            ...functionDeclaration,
            t.withStatement(
              t.identifier(gn.DATA),
              withBlockStatementPathNode = t.blockStatement([])
            )
          ]),
        )
      }
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
  })


  traverse(tree, {
    BlockStatement(path) {
      if (path.node === tempBlockStatementPathNode) {
        var code = generate(path.node).code.replace(/^{/, '').replace(/}$/, '')
        newFunctionParam.push(
          t.stringLiteral(gn.DATA),
          t.stringLiteral(gn.CREATEELEMENT),
          ...components.map(i => t.stringLiteral(i)),
          ...propKeys.map(i => t.stringLiteral(i)),
          ...otherIdentifiers.map(i => t.stringLiteral(i)),
          t.templateLiteral([t.templateElement({ raw: code })], [])
        )
        path.remove()
      }
    },
    CallExpression(path) {
      if (path.node.callee.name === 'Young') {
        programPath.node.body.unshift(
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
            t.arrowFunctionExpression(
              [],
              item.expression
            ),
            []
          )
        }
        return item.expression
      }
    }).filter(i => i !== 'Invalid Text')
  }

  function addToWithBlockPath(withBlockStatementPathNode, path) {
    if (path.parentPath.node.type === 'ExpressionStatement') {
      withBlockStatementPathNode.body.unshift(
        t.returnStatement(
          path.node
        )
      )
    }
  }

  function isComponent(tag) { return tag[0] === tag[0].toUpperCase() }

  const processedSource = generate(tree).code

  return processedSource
}
