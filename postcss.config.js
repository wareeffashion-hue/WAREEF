// postcss.config.js
module.exports = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': 'postcss-nesting',
    tailwindcss: {},
    'postcss-preset-env': {
      // Keep logical properties (inset-inline-*, margin-inline-*) as written so RTL works.
      features: { 'nesting-rules': true, 'logical-properties-and-values': false },
    },
  }
}