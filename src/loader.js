const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const generate = require('@babel/generator').default
const t = require('@babel/types')
const core = require('@babel/core')
const { filterJSXTextOrChildren, addToWithBlockPath } = require('./util')
// const fs = require('fs')

module.exports = function (source) {

  var fileName = this.resourcePath
    .match(/(?<=(\/|\\))[^(\/|\\)]+?\.young$/)[0]
    .replace(/\.young$/, '')

  var componentName = fileName[0].toUpperCase() + fileName.slice(1)

  var tree = parser.parse(source, {
    plugins: ['jsx'],
    sourceType: 'module',
  })

  var programPath
  var dataPathNode
  var newFunctionParam
  var rootFunctionBlockPathNode
  var withBlockStatementPathNode
  var tempBlockStatementPathNode
  var mountElement
  var propKeys = []
  var labelPropertyPathNodes = []
  var functionDeclaration = []
  var golobalIdentifiers = ['oTree', 'render', 'data']
  var requireIdentifiers = ['c', 'reactive', 'cStore', 'pStore']
  var youngPath = './young'

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
            propKeys.push(t.stringLiteral(path.node.name))
          }
        })
      }
      path.remove()
    },
  })

  traverse(tree, {
    Program(path) {
      programPath = path
      path.node.body.unshift(
        t.importDeclaration(
          requireIdentifiers.map(i => {
            return t.importSpecifier(
              t.identifier(i),
              t.identifier(i)
            )
          }),
          t.stringLiteral(youngPath)
        ),
        t.expressionStatement(
          t.callExpression(
            t.functionExpression(
              t.identifier(''),
              [],
              t.blockStatement([
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('cStore'),
                      t.identifier('set')
                    ),
                    [
                      t.stringLiteral(componentName),
                      t.identifier(componentName)
                    ]
                  )
                )
              ])
            ),
            []
          )
        ),
        t.functionDeclaration(
          t.identifier(componentName),
          [t.assignmentPattern(
            t.objectPattern(labelPropertyPathNodes),
            t.objectExpression([])
          )],
          rootFunctionBlockPathNode = t.blockStatement([])
        ),
        t.assignmentExpression(
          '=',
          t.memberExpression(
            t.identifier('module'),
            t.identifier('exports')
          ),
          t.identifier(componentName)
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
              t.objectPattern([
                t.objectProperty(
                  t.identifier('cacheProps'),
                  t.identifier('cacheProps')
                ),
                t.objectProperty(
                  t.identifier('cacheOTree'),
                  t.identifier('cacheOTree')
                )
              ]),
              t.callExpression(
                t.memberExpression(
                  t.identifier('pStore'),
                  t.identifier('get')
                ),
                [
                  t.stringLiteral(componentName)
                ]
              )
            )]
          ),
          t.ifStatement(
            t.identifier('cacheOTree'),
            t.blockStatement([
              t.ifStatement(
                t.callExpression(
                  t.memberExpression(
                    t.identifier('pStore'),
                    t.identifier('compare')
                  ),
                  [
                    t.identifier('cacheProps'),
                    t.objectExpression([...labelPropertyPathNodes])
                  ]
                ),
                t.blockStatement([
                  t.returnStatement(
                    t.identifier('cacheOTree')
                  )
                ])
              )
            ])
          ),
          t.variableDeclaration(
            'var',
            [t.variableDeclarator(
              t.identifier('render'),
              t.newExpression(
                t.identifier('Function'),
                newFunctionParam = []
              )
            )]
          ),
          t.functionDeclaration(
            t.identifier('getOTree'),
            [],
            t.blockStatement([
              t.returnStatement(
                t.identifier('oTree')
              )
            ])
          ),
          t.functionDeclaration(
            t.identifier('setOTree'),
            [t.identifier('nTree')],
            t.blockStatement([
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.identifier('oTree'),
                  t.identifier('nTree')
                )
              )
            ])
          ),
          t.variableDeclaration(
            'var',
            [t.variableDeclarator(
              t.identifier('data'),
              t.callExpression(
                t.callExpression(
                  t.identifier('reactive'),
                  [
                    t.identifier('render'),
                    t.identifier('c'),
                    t.identifier('getOTree'),
                    t.identifier('setOTree'),
                    t.arrayExpression(propKeys)
                  ]
                ),
                [dataPathNode = t.objectExpression([])]
              )
            )]
          ),
          t.variableDeclaration(
            'var',
            [t.variableDeclarator(
              t.identifier('oTree'),
              t.callExpression(
                t.identifier('render'),
                [
                  t.identifier('data'),
                  t.identifier('c')
                ]
              )
            )]
          ),
          t.callExpression(
            t.memberExpression(
              t.identifier('pStore'),
              t.identifier('set'),
            ),
            [
              t.stringLiteral(componentName),
              t.objectExpression([
                t.objectProperty(
                  t.identifier('cacheProps'),
                  t.objectExpression([...labelPropertyPathNodes])
                ),
                t.objectProperty(
                  t.identifier('cacheOTree'),
                  t.identifier('oTree')
                )
              ])
            ]
          ),
          t.returnStatement(
            t.identifier('oTree'),
          ),
          tempBlockStatementPathNode = t.blockStatement([
            ...functionDeclaration,
            t.withStatement(
              t.identifier('data'),
              withBlockStatementPathNode = t.blockStatement([])
            ),
            t.returnStatement(
              t.identifier('nTree')
            )
          ]),
        )
      }
    },
    VariableDeclaration(path) {
      //if (path.node.kind === 'const') return
      if (golobalIdentifiers.includes(path.node.declarations[0].id.name)) return
      if (path.parentPath.isProgram()) {
        const { id, init } = path.node.declarations[0]
        if (t.isArrowFunctionExpression(init)) {
          withBlockStatementPathNode.body.unshift(path.node)
          path.remove()
        } else if (t.isCallExpression(init) && init.callee.name === 'require') {
          path.skip()
        } else {
          dataPathNode.properties.push(t.objectProperty(id, init))
          path.remove()
        }
      }
    },
    JSXElement(path) {
      const { openingElement } = path.node
      const { children } = path.node
      const { name: { name: tag }, attributes } = openingElement
      const [isChildren, textOrChildren] = filterJSXTextOrChildren(children)
      const expression = t.callExpression(
        t.identifier('c'),
        [t.objectExpression([
          t.objectProperty(t.identifier('tag'), t.stringLiteral(tag)),
          t.objectProperty(
            t.identifier('attr'),
            t.objectExpression(
              attributes.map(({ name: { name: key }, value }) => {
                return t.objectProperty(
                  t.identifier(key),
                  t.isJSXExpressionContainer(value) ? value.expression : value
                )
              })
            )
          ),
          t.objectProperty(
            t.identifier('text'),
            !isChildren ?
              textOrChildren ?
                t.isJSXText(textOrChildren) ?
                  t.stringLiteral(textOrChildren?.value?.replace(/\/n/, '')?.trim() || '')
                  : textOrChildren
                : t.stringLiteral('')
              : t.stringLiteral('')
          ),
        ]),
        t.arrayExpression(isChildren ? textOrChildren : [])
        ])
      path.replaceWith(expression)
    },
  })

  var p
  traverse(tree, {
    BlockStatement(path) {
      if (path.node === tempBlockStatementPathNode) {
        p = path.node
        newFunctionParam.push(
          t.stringLiteral('data'),
          t.stringLiteral('c'),

          t.stringLiteral(generate(path.node).code.replace(/^{/, '').replace(/}$/, '')),
        )
        path.remove()
      }
    },
    CallExpression(path) {
      if (path.node.callee.name === 'Young') {
        programPath.node.body.unshift(
          t.importDeclaration(
            [t.importSpecifier(
              t.identifier('genTree'),
              t.identifier('genTree')
            )],
            t.stringLiteral(youngPath)
          )
        )
        mountElement = path.node.arguments[0]
        path.parentPath.replaceWith(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.callExpression(
                  t.memberExpression(
                    t.identifier('document'),
                    t.identifier('querySelector')
                  ), [mountElement]
                ),
                t.identifier('append')
              ),
              [t.callExpression(
                t.identifier('genTree'),
                [t.callExpression(
                  t.identifier(componentName),
                  [t.objectExpression([])]
                )]
              )]
            )
          )
        )
      }
    }
  })

  dataPathNode.properties = [...dataPathNode.properties, ...labelPropertyPathNodes]

  const processedSource = core.transformFromAstSync(tree, source, {
    plugins: ['@babel/plugin-transform-modules-umd']
  }).code

  const res = `${processedSource}\n`

  // fs.writeFileSync(`src/${componentName}.js`, res)

  return res  
}

