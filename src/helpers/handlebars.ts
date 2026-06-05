// @ts-nocheck
export function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper("join", (array, separator) => {
    if (!Array.isArray(array)) return "";
    return array.join(typeof separator === "string" ? separator : ", ");
  });

  Handlebars.registerHelper("or", (a, b) => a || b);

  Handlebars.registerHelper("concat", (...args) => {
    // Last arg is the Handlebars options object — exclude it
    return args.slice(0, -1).join("");
  });
}
