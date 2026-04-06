import path from "path";

export default function (filecontent, map, meta) {
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

  let importRegex =
    /import\s+(?:{[^{}]+}|.*?)\s*(?:from)?\s*['"].*?['"];?|import\(.*?\);?/;
  let match;
  let imports = [];
  while ((match = scriptContent.match(importRegex))) {
    imports.push(match[0]);
    scriptContent =
      scriptContent.slice(0, match.index) +
      scriptContent.slice(match.index + match[0].length);
  }

  callback(
    null,
    `import { BuildingBlocks } from 'building-blocks';
    ${imports.join("\n    ")}
    
    (() => {

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
    })();`,
    map,
    meta,
  );
}
