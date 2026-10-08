const path = require('path');

module.exports = {
  entry: { main: './src/index.js', 'password-reset': './src/passwordResetPage.js' },
  output: {
    filename: '[name].js',
    chunkFilename: 'chunks/[id].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
  },
//     optimization: {
//     minimize: false
//   },
  mode: "production",
  devtool: 'inline-source-map',
  
  
};
