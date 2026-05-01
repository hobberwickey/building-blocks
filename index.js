// Just in case this is getting loaded in a context without HTMLElement
export let BuildingBlocks;

if (typeof HTMLElement !== "undefined") {
  BuildingBlocks = class BuildingBlocks extends HTMLElement {
    constructor() {
      super();

      this.__template__ = null;
      this.__connected__ = false;
      this.__children__ = [];

      // Context Variables
      this.__bindings__ = [];
      this.__childcontexts__ = {};
      this.__observed__ = {};
      this.__values__ = {};
      this.__current_target__ = null;
    }

    static get observedProperties() {
      return [];
    }

    listen(key, fn) {
      const uuid = () => {
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (
            +c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
          ).toString(16),
        );
      };

      let handle = uuid();
      if (this.__observed__.hasOwnProperty(key)) {
        let observers = this.__observed__[key];
        let idx = observers.findIndex(
          (o) => o.el === this && o.attr === handle,
        );

        let observer = {
          el: this,
          attr: handle,
          hidden: true,
          snippet: "",
          context: this,
          bindings: [
            (context, values) => {
              return fn(values[key]);
            },
          ],
        };

        if (idx === -1) {
          observers.push(observer);
        } else {
          observers.splice(idx, 1, observer);
        }
      }
    }

    observe(prop, ctx) {
      ctx = ctx || this;

      ctx.__observed__[prop] = [];
      ctx.__values__[prop] = ctx[prop];

      Object.defineProperty(ctx, prop, {
        get: () => {
          if (
            ctx.__current_target__ !== null &&
            ctx.__observed__.hasOwnProperty(prop)
          ) {
            let { el, attr, snippet, context, bindings } =
              ctx.__current_target__;

            let observers = ctx.__observed__[prop];
            let idx = observers.findIndex(
              (o) => o.el === el && o.attr === attr,
            );

            if (idx === -1) {
              observers.push({ ...ctx.__current_target__ });
            } else {
              observers.splice(idx, 1, { ...ctx.__current_target__ });
            }
          }

          return ctx.__values__[prop];
        },
        set: (value) => {
          if (value !== ctx.__values__[prop]) {
            ctx.__values__[prop] = value;

            let observers = ctx.__observed__[prop] || [];
            let len = observers.length;

            for (var i = 0; i < len; i++) {
              let { el, attr, hidden, snippet, context, bindings } =
                observers[i];
              let values = context.__get_values__(ctx);

              for (let i = 0; i < bindings.length; i++) {
                snippet = bindings[i](snippet, values, attr);
              }

              if (typeof snippet === "function") {
                el[attr.replace(":", "")] = snippet.bind(this);
              } else {
                if (["USE", "use"].includes(el.tagName)) {
                  el.setAttribute(attr.replace(":", ""), snippet);
                } else {
                  el[attr.replace(":", "")] = snippet;
                }
              }

              if (!["array", "object", "function"].includes(typeof snippet)) {
                if (!hidden && !!el.setAttribute) {
                  el.setAttribute(attr.replace(":", ""), snippet);
                }
              }
            }
          }
        },
      });
    }

    connectedCallback() {
      const name = this.tagName.toLowerCase();

      if (!this.__connected__) {
        this.__connected__ = true;

        this.constructor.observedProperties.map((prop) => {
          this.observe(prop, this);
        });

        this.__children__ = [...this.children];
        let template = document.createDocumentFragment();
        if (!!this.__template__) {
          template = this.__template__.content.cloneNode(true);
          this.__parseTemplate__(template, this);
        }

        this.__render__(this);

        this.appendChild(template);

        if (!!this.connected) {
          this.connected();
        }
      }
    }

    disconnectedCallback() {
      if (!!this.disconnected) {
        this.disconnected();
      }
    }

    __parseTemplate__(template, ctx) {
      const eventExp = /\@([a-z|A-Z]+)/;
      const attrExp = /\:([a-z|A-Z]+)/;
      const boundExp = /\{\{(.*?)\}\}/g;

      const getBinding = (el, attr, ctx) => {
        let binding = ctx.__bindings__.find((b) => b.el === el);

        if (!binding) {
          binding = {
            el: el,
            attrs: {},
          };

          ctx.__bindings__.push(binding);
        }

        if (!binding.attrs[attr]) {
          let snippet;
          if (/template\-[0-9]+/i.test(attr)) {
            let templateIdx = +attr.split("-")[1];
            snippet = el.querySelectorAll("template")[templateIdx];
          } else {
            snippet = el[attr];
            if (!!el.getAttribute) {
              snippet = el.getAttribute(attr);
            }
          }

          binding.attrs[attr] = {
            snippet: snippet,
            bindings: [],
            previous: {},
          };
        }

        return binding;
      };

      const bindValue = (el, attr, match, ctx) => {
        let binding = getBinding(el, attr, ctx);

        if (attr === "textContent") {
          let fn = new Function(
            "scope",
            `
            with(scope) {
              return ${match[1]}
            }`,
          );

          binding.attrs[attr].bindings.push((snippet, values) => {
            return snippet.replace(match[0], fn(values));
          });
        }
      };

      const bindAttribute = (el, attr, context, ctx) => {
        let binding = getBinding(el, attr, ctx);

        let fn = new Function(
          "scope",
          `
          with(scope) {
            return ${context};
          }`,
        );

        binding.attrs[attr].bindings.push((snippet, values) => {
          return fn(values);
        });
      };

      const bindEvent = (el, attr, context, ctx) => {
        let fn = new Function(
          "scope",
          `         
          with(scope) {
            return ${context}
          }`,
        );

        el.addEventListener(attr.replace("@", ""), (e) => {
          let values = ctx.__get_values__(ctx);

          values["$event"] = e;
          fn(values);
        });
      };

      const createTemplateContext = (oCtx, idx, key, value, aliases) => {
        let values = {};

        let ctx = {
          __id__: (Math.random() * 10000000) | 0,
          __bindings__: [],
          __observed__: {},
          __childbindings__: [],
          __childcontexts__: {},
          __values__: values,
          __template__: null,
          __parent__: oCtx,
          __current_target__: null,

          __get_values__: () => {
            return this.__get_values__(ctx);
          },
        };

        for (let _key in oCtx.__observed__) {
          ctx[_key] = oCtx[_key];
          this.observe(_key, ctx);
        }

        if (!!aliases.$idx) {
          ctx[aliases.$idx] = idx;
          this.observe(aliases.$idx, ctx);
        } else {
          ctx["$idx"] = idx;
          this.observe("$idx", ctx);
        }

        if (!!aliases.$key) {
          ctx[aliases.$key] = key;
          this.observe(aliases.$key, ctx);
        } else {
          ctx["$key"] = key;
          this.observe("$key", ctx);
        }

        if (!!aliases.$value) {
          ctx[aliases.$value] = value;
          this.observe(aliases.$value, ctx);
        } else {
          ctx["$value"] = value;
          this.observe("$value", ctx);
        }

        // console.log(ctx)

        return ctx;
      };

      const updateTemplateContext = (ctx, oCtx) => {
        for (var key in oCtx.__observed__) {
          ctx[key] = oCtx[key];
        }
      };

      const bindTemplate = (el, oCtx) => {
        let templateIdx = [
          ...el.parentNode.querySelectorAll("template"),
        ].indexOf(el);

        let idxAlias = el.getAttribute("$idx") || "";
        let keyAlias = el.getAttribute("$key") || "";
        let valueAlias = el.getAttribute("$value") || "";

        let aliases = {};
        if (!!idxAlias) {
          aliases.$idx = idxAlias;
        }

        if (!!keyAlias) {
          aliases.$key = keyAlias;
        }

        if (!!valueAlias) {
          aliases.$value = valueAlias;
        }

        let binding = getBinding(
          el.parentNode,
          `template-${templateIdx}`,
          oCtx,
        );

        let type = el.hasAttribute(":for") ? "loop" : "if";
        if (type === "loop") {
          let iteratorFn = new Function(
            `scope`,
            `with(scope) {
              return ${el.getAttribute(":for")}
            }`,
          );

          let idSnippet = el.getAttribute(":id");
          if (!idSnippet) {
            console.warn(
              "For loop templates must have an :id, index is being used as a default but that could result in unnecessary reredeners",
            );
            idSnippet = "$idx";
          }

          let idFunction = new Function(
            `scope`,
            `with(scope) {
              return ${idSnippet}
            }`,
          );

          // Create pass through observers
          for (let key in oCtx.__observed__) {
            oCtx.__observed__[key].push({
              el: el,
              snippet: null,
              attr: `for-loop-${templateIdx}`,
              hidden: true,
              context: oCtx,
              bindings: [
                (snippet, values) => {
                  for (let x in oCtx.__childcontexts__) {
                    oCtx.__childcontexts__[x][key] = values[key];
                  }
                },
              ],
            });
          }

          let fn = (snippet, values, attr) => {
            // Get the iterator value;
            let iterator = iteratorFn(values);

            // Create a document fagment to append items to
            let frag = document.createDocumentFragment();

            // Remove all any elements created from a previous call
            let previous = binding.attrs[attr].previous;
            let previousIds = Object.keys(previous);
            let deletedIds = Object.keys(previous);

            if (!!iterator) {
              let idx = 0;
              // let child_bindings = {};
              let child_contexts = [];
              for (let key in iterator) {
                // Create a new context, evaluate the idFunction with it
                let ctx = createTemplateContext(
                  oCtx,
                  idx,
                  key,
                  iterator[key],
                  aliases,
                );
                let ctxValues = ctx.__get_values__(ctx);
                let id = idFunction(ctxValues).toString();

                child_contexts.push(ctx);
                if (previousIds.includes(id)) {
                  updateTemplateContext(previous[id].ctx, ctx);
                  deletedIds = deletedIds.filter((_id) => _id !== id);
                  idx++;

                  continue;
                }

                oCtx.__childcontexts__[`${templateIdx}-${id}`] = ctx;

                // Clone the template
                let created = [];
                let item = el.content.cloneNode(true);

                // Parse the template
                walk(item, ctx, true);

                // Render the context
                this.__render__(ctx, true);

                // Keep track of created items
                created.push(...item.childNodes);

                // append then render
                frag.append(item);

                // Store the created elements and context under the id
                previous[id] = {
                  elements: created,
                  ctx: ctx,
                };
                // increment the index
                idx++;
              }
            }

            // Set the created elements to be removed on the next render
            for (let i = 0; i < deletedIds.length; i++) {
              let id = deletedIds[i];
              let doomed = previous[id].elements;
              for (let j = 0; j < doomed.length; j++) {
                doomed[j].remove();
              }

              delete oCtx.__childcontexts__[`${templateIdx}-${id}`];
              delete previous[id];
            }

            // If this the template is being rendered create bindings on the parent scope
            el.parentNode.insertBefore(frag, el);
          };

          binding.attrs[`template-${templateIdx}`].bindings.push(fn);
        } else if (type === "if") {
          let conditionalFn = new Function(
            `scope`,
            `with(scope) {
              return ${el.getAttribute(":if")}
            }`,
          );

          // Create pass through observers
          for (let key in oCtx.__observed__) {
            oCtx.__observed__[key].push({
              el: el,
              snippet: null,
              attr: `if-block-${templateIdx}`,
              hidden: true,
              context: oCtx,
              bindings: [
                (snippet, values, attr) => {
                  for (let x in oCtx.__childcontexts__) {
                    oCtx.__childcontexts__[x][key] = values[key];
                  }
                },
              ],
            });
          }

          let fn = (snippet, values, attr) => {
            // Get the iterator value;
            let conditional = conditionalFn(values);

            // Create a document fagment to append items to
            let frag = document.createDocumentFragment();

            // Get the previously created elements and context
            let previous = binding.attrs[attr].previous["if-key"] || {
              elements: [],
              ctx: null,
            };

            let previouslyCreated = previous.elements;
            let previousCtx = previous.ctx;

            // Scoped variables
            let created = [];
            let createdCtx = null;
            // let child_bindings = {};

            // Check if the test function is truthy
            if (conditional) {
              // Check if there is a previously created element and context
              if (previouslyCreated.length > 0 && previousCtx !== null) {
                // If so, all we need to do is update the values of the
                // previously created context with the new values
                updateTemplateContext(previousCtx, ctx);
                return;
              } else {
                // If not then we need to create the element and it's bindings

                // Clone the template
                let item = el.content.cloneNode(true);

                if (this.tagName === "FOLDER-LIST") {
                  oCtx;
                }

                // Create a new context
                let ctx = createTemplateContext(
                  oCtx,
                  oCtx.$idx || null,
                  oCtx.$key || null,
                  oCtx.$value || null,
                  aliases,
                );

                oCtx.__childcontexts__[`if-block-${templateIdx}`] = ctx;

                // Parse the template
                walk(item, ctx, true);

                // Render the context
                this.__render__(ctx);

                // Keep track of created items
                created.push(...item.childNodes);
                createdCtx = ctx;

                // append then render
                frag.append(item);

                // If this the template is being rendered create bindings on the parent scope
                el.parentNode.insertBefore(frag, el);
              }
            } else {
              delete oCtx.__childcontexts__[`if-block-${templateIdx}`];

              for (let i = 0; i < previouslyCreated.length; i++) {
                previouslyCreated[i].remove();
              }
            }

            // Set the created elements to be removed on the next render
            binding.attrs[attr].previous["if-key"] = {
              elements: created,
              ctx: createdCtx,
            };
          };

          binding.attrs[`template-${templateIdx}`].bindings.push(fn);
        }
      };

      const walk = (el, ctx, log) => {
        if (!!el.tagName && (el.tagName || "").toLowerCase() === "template") {
          return bindTemplate(el, ctx);
        }

        let attrs = [...(el.attributes || [])];
        let children = [...(el.childNodes || [])];

        if (el.nodeType === 3) {
          let match;
          while ((match = boundExp.exec(el.textContent)) !== null) {
            bindValue(el, "textContent", match, ctx);
          }
        } else {
          for (var i = 0; i < attrs.length; i++) {
            if (attrExp.test(attrs[i].name)) {
              bindAttribute(el, attrs[i].name, attrs[i].value, ctx);
              // el.setAttribute(attrs[i].name.replace(":", ""), attrs[i].value);
            }

            if (eventExp.test(attrs[i].name)) {
              bindEvent(el, attrs[i].name, attrs[i].value, ctx);
              // el.setAttribute(attrs[i].name);
            }
          }
        }

        children.map((c) => {
          walk(c, ctx, log);
        });
      };

      walk(template, this);
    }

    __get_values__(ctx) {
      let values = {};
      let methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(Object.getPrototypeOf(this)),
      ).filter((method) => {
        return typeof this[method] === "function";
      });

      for (let i = 0; i < methods.length; i++) {
        if (typeof this[methods[i]] === "function") {
          Object.defineProperty(values, methods[i], {
            get: () => {
              return this[methods[i]].bind(this);
            },
          });
        }
      }

      let keys = Object.keys(ctx.__observed__);
      for (let i = 0; i < keys.length; i++) {
        Object.defineProperty(values, keys[i], {
          get: () => {
            return ctx[keys[i]];
          },
        });
      }

      return values;
    }

    __render__(ctx, log) {
      let values = ctx.__get_values__(ctx);

      for (let i = 0; i < ctx.__bindings__.length; i++) {
        let binding = ctx.__bindings__[i];
        let el = binding.el;

        for (let attr in binding.attrs) {
          let { snippet, bindings } = binding.attrs[attr];

          ctx.__current_target__ = {
            el,
            attr,
            snippet,
            context: ctx,
            bindings,
          };

          for (let i = 0; i < bindings.length; i++) {
            snippet = bindings[i](snippet, values, attr);
          }

          if (typeof snippet === "function") {
            el[attr.replace(":", "")] = snippet.bind(this);
          } else {
            if (["USE", "use"].includes(el.tagName)) {
              el.setAttribute(attr.replace(":", ""), snippet);
            } else {
              el[attr.replace(":", "")] = snippet;
            }
          }

          if (!["array", "object", "function"].includes(typeof snippet)) {
            if (!binding.hidden && !!el.setAttribute) {
              el.setAttribute(attr.replace(":", ""), snippet);
            }
          }
        }
      }

      ctx.__current_target__ = null;
    }
  };
} else {
  BuildingBlocks = class BuildingBlocks {
    constructor() {
      console.warn("Building Blocks could ironically not be built");
    }
  };
}

// Simple subscribable storage, there's better out there you should probably use them
export class ContextBlocks {
  constructor(obj) {
    this.__values__ = { ...obj };
    this.__subscriptions__ = Object.keys(obj).reduce((a, c) => {
      a[c] = [];
      return a;
    }, {});

    this.__handles__ = {};
    this.__bindings__ = {};

    let props = Object.keys(obj);
    for (var i = 0; i < props.length; i++) {
      let prop = props[i];

      var p = {};
      p[prop] = {
        get: () => {
          return this.__values__[prop];
        },

        set: (value) => {
          const subscribers = this.__subscriptions__[prop];
          const oldValue = this.__values__[prop];

          this.__values__[prop] = value;
          for (let i = 0; i < subscribers.length; i++) {
            subscribers[i](value, oldValue);
          }
        },
      };

      Object.defineProperties(this, p);
    }
  }

  toJSON() {
    return this.__values__;
  }

  bind(element, key, fn) {
    if (!this.__subscriptions__.hasOwnProperty(key)) {
      console.warn(`Can not bind ${element} to ${key}: no such key exists`);
      return;
    }

    if (!element.isConnected) {
      console.warn(
        `Can not bind ${element} to ${key}: the element is not connected to the DOM`,
      );
      return;
    }

    let wrapped = (newValue, oldValue) => {
      if (!element.isConnected) {
        this.__subscriptions__[key] = this.__subscriptions__[key].filter(
          (s) => {
            return s !== wrapped;
          },
        );

        return;
      }

      fn(newValue, oldValue);
    };

    this.__subscriptions__[key].push(wrapped);
    wrapped(this.__values__[key], null);
  }

  bindOnce(element, key, fn) {
    if (!this.__subscriptions__.hasOwnProperty(key)) {
      console.warn(`Can not bind ${element} to ${key}: no such key exists`);
      return;
    }

    if (!element.isConnected) {
      console.warn(
        `Can not bind ${element} to ${key}: the element is not connected to the DOM`,
      );
      return;
    }

    let wrapped = (newValue, oldValue) => {
      if (!element.isConnected) {
        this.__subscriptions__[key] = this.__subscriptions__[key].filter(
          (s) => {
            return s !== wrapped;
          },
        );

        this.__bindings__ = this.__bindings__.filter((e) => e !== element);

        return;
      }

      fn(newValue, oldValue);
    };

    if (!this.__bindings__[key]) {
      this.__bindings__[key] = [];
    }

    let binding = this.__bindings__[key].find((e) => e === element);
    if (!!binding) {
      return;
    }

    this.__bindings__[key].push(element);
    this.__subscriptions__[key].push(wrapped);
    wrapped(this.__values__[key], null);
  }

  listen(key, fn, handle) {
    if (!this.__subscriptions__.hasOwnProperty(key)) {
      console.log("Can not subscribe, no key exists");
      return;
    }

    if (!!handle) {
      if (this.__handles__.hasOwnProperty(handle)) {
        console.warn(
          `handle ${handle} already exists, you may be trying to subscribe more than once`,
        );
        return;
      }
    } else {
      // console.warn(
      //   `it is highly recommended you use a handler when subscribing`,
      // );
    }

    this.__subscriptions__[key].push(fn);

    if (!!handle) {
      this.__handles__[handle] = fn;
    }
  }

  unlisten(key, fn, handle) {
    if (!!handle) {
      fn = this.__handles__[handle];
    }

    let idx = this.__subscriptions__[key].findIndex((f) => f === fn);

    if (idx !== -1) {
      this.__subscriptions__.splice(idx, 1);
    }
  }

  createListenable(prop, value) {
    if (this.hasOwnProperty(key)) {
      console.warn(`Watched key ${key} already exists`);
      return;
    }

    this.__values__[prop] = value;
    this.__subscriptions__[prop] = [];

    var p = {};
    p[prop] = {
      get: () => {
        return this.__values__[prop];
      },

      set: (value) => {
        const subscribers = this.__subscriptions__[prop];
        const oldValue = this.__values__[prop];

        this.__values__[prop] = value;
        for (let i = 0; i < subscribers.length; i++) {
          subscribers(value, oldValue);
        }
      },
    };

    Object.defineProperties(this, p);
  }
}
