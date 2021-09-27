const t = require('@babel/types')

function filterJSXTextOrChildren(children) {
  const text = [], childs = []
  children.forEach(item => {
    if (!item.expression) {
      if (t.isJSXElement(item)) {
        childs.push(item)
      } else {
        text.push(item)
      }
    } else {
      var callPathNode, menberPathNode
      if (
        t.isCallExpression(callPathNode = item.expression) &&
        t.isMemberExpression(menberPathNode = callPathNode.callee) &&
        ['map', 'filter'].includes(menberPathNode.property.name)
      ) {
        childs.push(t.spreadElement(item.expression))
      } else {
        text.push(item.expression)
      }
    }
  })
  return childs.length ? [true, childs] : [false, text.length ? text[0] : '']
}

function addToWithBlockPath(withBlockStatementPathNode, path) {
  if (path.parentPath.node.type === 'ExpressionStatement') {
    withBlockStatementPathNode.body.unshift(
      t.assignmentExpression(
        '=',
        t.identifier('nTree'),
        path.node
      )
    )
  }
}

module.exports = {
  filterJSXTextOrChildren, addToWithBlockPath
}