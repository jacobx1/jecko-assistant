import { z } from 'zod';
import { OpenAI } from 'openai';

interface OpenAIProperty {
  type: string | string[];
  description?: string;
  default?: any;
  enum?: string[];
  items?: OpenAIProperty;
  properties?: Record<string, OpenAIProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Get description from Zod schema
 */
function getZodDescription(schema: z.ZodTypeAny): string | undefined {
  return (schema as any)._def?.description;
}

/**
 * Convert a Zod schema to OpenAI function parameter schema
 */
function zodSchemaToOpenAIProperty(schema: z.ZodTypeAny): OpenAIProperty {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, OpenAIProperty> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      // In strict mode, ALL properties must be in the required array
      required.push(key);
      
      // Check if this is an optional, nullable, or default field
      const isOptional = fieldSchema instanceof z.ZodOptional;
      const isNullable = fieldSchema instanceof z.ZodNullable;
      const hasDefault = fieldSchema instanceof z.ZodDefault;

      if (isOptional) {
        // Optional fields are required in schema but can be null
        const innerProperty = zodSchemaToOpenAIProperty(fieldSchema.unwrap());
        properties[key] = {
          ...innerProperty,
          type: Array.isArray(innerProperty.type)
            ? [...innerProperty.type, 'null']
            : [innerProperty.type, 'null'],
        };
      } else if (isNullable) {
        // Nullable fields can be null
        const innerProperty = zodSchemaToOpenAIProperty(fieldSchema.unwrap());
        properties[key] = {
          ...innerProperty,
          type: Array.isArray(innerProperty.type)
            ? [...innerProperty.type, 'null']
            : [innerProperty.type, 'null'],
        };
      } else if (hasDefault) {
        // Default fields are required but use their default if not provided
        const innerProperty = zodSchemaToOpenAIProperty(fieldSchema as z.ZodTypeAny);
        properties[key] = innerProperty;
      } else {
        // Required property - must be present and non-null
        properties[key] = zodSchemaToOpenAIProperty(fieldSchema as z.ZodTypeAny);
      }
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  // Handle ZodString
  if (schema instanceof z.ZodString) {
    const property: OpenAIProperty = { type: 'string' };
    const description = getZodDescription(schema);
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodNumber
  if (schema instanceof z.ZodNumber) {
    const property: OpenAIProperty = { type: 'number' };
    const description = getZodDescription(schema);
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    const property: OpenAIProperty = { type: 'boolean' };
    const description = getZodDescription(schema);
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    const property: OpenAIProperty = {
      type: 'array',
      items: zodSchemaToOpenAIProperty(schema.element),
    };
    const description = getZodDescription(schema);
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodEnum
  if (schema instanceof z.ZodEnum) {
    const property: OpenAIProperty = {
      type: 'string',
      enum: schema.options,
    };
    const description = getZodDescription(schema);
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodOptional
  if (schema instanceof z.ZodOptional) {
    return zodSchemaToOpenAIProperty(schema.unwrap());
  }

  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    const innerProperty = zodSchemaToOpenAIProperty(schema.unwrap());
    return {
      ...innerProperty,
      type: Array.isArray(innerProperty.type)
        ? [...innerProperty.type, 'null']
        : [innerProperty.type, 'null'],
    };
  }

  // Handle ZodDefault
  if (schema instanceof z.ZodDefault) {
    const property = zodSchemaToOpenAIProperty(schema.removeDefault());
    property.default = schema._def.defaultValue();

    // Try to get description from the ZodDefault itself first, then from inner schema
    const description =
      getZodDescription(schema) || getZodDescription(schema.removeDefault());
    if (description) {
      property.description = description;
    }
    return property;
  }

  // Handle ZodUnion (for simple unions like string | number)
  if (schema instanceof z.ZodUnion) {
    // For simplicity, just use the first option's type
    // In practice, you might want more sophisticated handling
    return zodSchemaToOpenAIProperty(schema.options[0]);
  }

  // Fallback for unsupported types
  console.warn(`Unsupported Zod type: ${schema.constructor.name}`);
  return { type: 'string' };
}

/**
 * Convert a Zod schema to OpenAI function definition
 */
export function zodSchemaToOpenAIFunction(
  name: string,
  description: string,
  schema: z.ZodObject<any>
): OpenAI.ChatCompletionTool {
  const parametersSchema = zodSchemaToOpenAIProperty(schema);

  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: parametersSchema.properties || {},
        required: parametersSchema.required || [],
        additionalProperties: false,
      },
      strict: true,
    },
  };
}

/**
 * Extract required fields from Zod object schema
 * In strict mode, ALL fields are required
 */
export function getRequiredFields(schema: z.ZodObject<any>): string[] {
  const shape = schema.shape;
  const required: string[] = [];

  for (const [key] of Object.entries(shape)) {
    // In strict mode, ALL properties are required
    required.push(key);
  }

  return required;
}
