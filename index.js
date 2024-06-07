// json-templates
// Simple templating within JSON structures.
//
// Created by Curran Kelleher and Chrostophe Serafin.
// Contributions from Paul Brewer and Javier Blanco Martinez.
const objectPath = require('object-path');

// An enhanced version of `typeof` that handles arrays and dates as well.
function type(value) {
  let valueType = typeof value;
  if (Array.isArray(value)) {
    valueType = 'array';
  } else if (value instanceof Date) {
    valueType = 'date';
  } else if (value === null) {
    valueType = 'null';
  }

  return valueType;
}

// Constructs a parameter object from a match result.
// e.g. "['{{foo}}']" --> { key: "foo" }
// e.g. "['{{foo:bar}}']" --> { key: "foo", defaultValue: "bar" }
function Parameter(match) {
  let param;
  const matchValue = match.substr(2, match.length - 4).trim();
  const i = matchValue.indexOf(':');

  if (i !== -1) {
    param = {
      key: matchValue.substr(0, i),
      defaultValue: matchValue.substr(i + 1),
    };
  } else {
    param = { key: matchValue };
  }

  return param;
}

// Constructs a template function with deduped `parameters` property.
function Template(fn, parameters) {
  fn.parameters = Array.from(
    new Map(parameters.map((parameter) => [parameter.key, parameter])).values(),
  );
  return fn;
}

// Parses the given template object.
//
// Returns a function `template(context)` that will "fill in" the template
// with the context object passed to it.
//
// The returned function has a `parameters` property,
// which is an array of parameter descriptor objects,
// each of which has a `key` property and possibly a `defaultValue` property.
function parse(value, customRegex) {
  switch (type(value)) {
    case 'string':
      return parseString(value, customRegex);
    case 'object':
      return parseObject(value, customRegex);
    case 'array':
      return parseArray(value, customRegex);
    default:
      return Template(function () {
        return value;
      }, []);
  }
}

// Parses leaf nodes of the template object that are strings.
// Also used for parsing keys that contain templates.
const parseString = (() => {
  // This regular expression detects instances of the
  // template parameter syntax such as {{foo}} or {{foo:someDefault}}.
  const regex = /{{(\w|:|[\s-+.,@/\//()?=*_$])+}}/g;

  return (str, customRegex) => {
    let parameters = [];
    let templateFn = () => str;

    const matches = str.match(customRegex || regex);
    if (matches) {
      parameters = matches.map(Parameter);
      templateFn = (context) => {
        context = context || {};
        return matches.reduce((result, match, i) => {
          const parameter = parameters[i];
          let value = objectPath.get(context, parameter.key);

          if (typeof value === 'undefined') {
            value = parameter.defaultValue;
          }

          if (typeof value === 'function') {
            value = value();
          }

          // Accommodate non-string as original values.
          if (
            matches.length === 1 &&
            str.startsWith('{{') &&
            str.endsWith('}}')
          ) {
            return value;
          }

          // Treat Date value inside string to ISO string.
          if (value instanceof Date) {
            value = value.toISOString();
          }

          return result.replace(match, value == null ? '' : value);
        }, str);
      };
    }

    return Template(templateFn, parameters);
  };
})();

// Parses non-leaf-nodes in the template object that are objects.
function parseObject(object, customRegex) {
  const children = Object.keys(object).map((key) => ({
    keyTemplate: parseString(key, customRegex),
    valueTemplate: parse(object[key], customRegex),
  }));
  const templateParameters = children.reduce(
    (parameters, child) =>
      parameters.concat(
        child.valueTemplate.parameters,
        child.keyTemplate.parameters,
      ),
    [],
  );
  const templateFn = (context) => {
    return children.reduce((newObject, child) => {
      newObject[child.keyTemplate(context)] = child.valueTemplate(context);
      return newObject;
    }, {});
  };

  return Template(templateFn, templateParameters);
}

// Parses non-leaf-nodes in the template object that are arrays.
function parseArray(array, customRegex) {
  const templates = array.map((value) => parse(value, customRegex));
  const templateParameters = templates.reduce(
    (parameters, template) => parameters.concat(template.parameters),
    [],
  );
  const templateFn = (context) =>
    templates.map((template) => template(context));

  return Template(templateFn, templateParameters);
}

module.exports = parse;
