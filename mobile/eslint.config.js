// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Ban `${...}` preceded by a literal "$" — i.e. hardcoded dollar signs on
      // money. Sellers price in their own currency (NGN, GHS, ...), so a
      // hardcoded "$" silently mislabels every non-USD amount in the app.
      //
      // Matches a non-tail template chunk ending in "$", which is exactly the
      // `$${amount}` shape. Use formatMoney()/priceLabel() from
      // @/constants/payments instead, passing the item's OWN currency.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral > TemplateElement[tail=false][value.raw=/\\$$/]',
          message:
            'Hardcoded "$" before an interpolation. Use formatMoney(amount, currency) or ' +
            'priceLabel(price, currency) from @/constants/payments so non-USD sellers ' +
            'render their real currency.',
        },
      ],
    },
  },
]);
