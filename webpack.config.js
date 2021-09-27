const path = require('path')

module.exports = {
    mode: 'production',
    entry: './src/loader.js',
    output: {
        library: 'Frame',
        libraryTarget: 'umd',
        libraryExport: 'default',
        path: path.join(__dirname, '/dist/'),
        filename: 'index.js'
    }
}; 