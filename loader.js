import path from "path";

export default function (filecontent) {
  let callback = this.async();
  let componentPath = path.resolve("./component.js");

  this.addDependency(componentPath);

  let elementName = this.resourcePath.split("/").pop().split(".")[0];

  let templateLength = filecontent.match(/(<template.*(?=>)>)?/)[0].length;
  let templateStart = filecontent.indexOf("<template");
  let templateEnd = filecontent.lastIndexOf("</template>");

  let templateContent = filecontent.slice(
    templateStart + templateLength,
    templateEnd,
  );

  let scriptLength = "<script>".length;
  let scriptStart = filecontent.indexOf("<script");
  let scriptEnd = filecontent.lastIndexOf("</script>");

  let scriptContent = filecontent.slice(scriptStart + scriptLength, scriptEnd);

  if (!scriptContent) {
    console.log(`File is not a valid component`);
    return;
  } else {
    console.log(`Bundling Component ${elementName}`);
  }

  return `
    (() => {
      import BuildingBlocks from 'building-blocks';

      if (typeof Component === undefined) {
        return console.warn("'Component' class must be loaded before individual components");
      }

      const name = '${elementName}';

      const template = document.createElement("template");
            template.innerHTML = \`${templateContent}\`;

      const ElementClass = ${scriptContent};

      customElements.define(name, class extends ElementClass {
        constructor() {
          super();

          this.__template__ = template;
        }    
      });      
    })();`;
}
