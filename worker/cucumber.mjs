export default {
  paths: ["../features/**/*.feature"],
  import: ["acceptance/**/*.ts"],
  tags: "not @pending",
  formatOptions: { snippetInterface: "async-await" },
};
