import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Config } from '../schemas/config.js';
import { SlashCommand } from './types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface ConfigFormProps {
  config: Config;
  onSave: (newConfig: Config) => void;
  onCancel: () => void;
}

const ConfigForm: React.FC<ConfigFormProps> = ({ config, onSave, onCancel }) => {
  const [currentField, setCurrentField] = useState(0);
  const [formData, setFormData] = useState({
    openaiApiKey: config.openai.apiKey === 'sk-your-openai-api-key-here' ? '' : config.openai.apiKey,
    openaiModel: config.openai.model,
    serperApiKey: config.serper.apiKey === 'your-serper-api-key-here' ? '' : config.serper.apiKey,
    maxTokens: config.maxTokens.toString(),
    temperature: config.temperature.toString(),
  });

  const fields = [
    { key: 'openaiApiKey', label: 'OpenAI API Key', placeholder: 'sk-...' },
    { key: 'openaiModel', label: 'OpenAI Model', placeholder: 'gpt-4' },
    { key: 'serperApiKey', label: 'Serper API Key', placeholder: 'your-serper-key' },
    { key: 'maxTokens', label: 'Max Tokens', placeholder: '4000' },
    { key: 'temperature', label: 'Temperature', placeholder: '0.7' },
  ];

  const handleSave = useCallback(() => {
    const newConfig: Config = {
      openai: {
        apiKey: formData.openaiApiKey || config.openai.apiKey,
        model: formData.openaiModel || config.openai.model,
        baseURL: config.openai.baseURL,
      },
      serper: {
        apiKey: formData.serperApiKey || config.serper.apiKey,
      },
      maxTokens: parseInt(formData.maxTokens) || config.maxTokens,
      temperature: parseFloat(formData.temperature) || config.temperature,
    };

    try {
      const configPath = join(process.cwd(), '.jecko.config.json');
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
      onSave(newConfig);
    } catch (error) {
      // Handle error - for now just cancel
      onCancel();
    }
  }, [formData, config, onSave, onCancel]);

  useInput((input, key) => {
    if (key.upArrow && currentField > 0) {
      setCurrentField(currentField - 1);
    } else if (key.downArrow && currentField < fields.length - 1) {
      setCurrentField(currentField + 1);
    } else if (key.return) {
      if (currentField === fields.length - 1) {
        handleSave();
      } else {
        setCurrentField(currentField + 1);
      }
    } else if (key.escape) {
      onCancel();
    } else if (key.backspace || key.delete) {
      const fieldKey = fields[currentField].key as keyof typeof formData;
      setFormData(prev => ({
        ...prev,
        [fieldKey]: prev[fieldKey].slice(0, -1),
      }));
    } else if (input && !key.ctrl && !key.meta) {
      const fieldKey = fields[currentField].key as keyof typeof formData;
      setFormData(prev => ({
        ...prev,
        [fieldKey]: prev[fieldKey] + input,
      }));
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">⚙️  Configuration</Text>
      </Box>
      
      {fields.map((field, index) => {
        const isActive = index === currentField;
        const value = formData[field.key as keyof typeof formData];
        const isPassword = field.key.toLowerCase().includes('key');
        
        return (
          <Box key={field.key} marginBottom={1}>
            <Box width={20}>
              <Text color={isActive ? 'green' : 'gray'}>
                {isActive ? '> ' : '  '}{field.label}:
              </Text>
            </Box>
            <Box flexGrow={1} borderStyle={isActive ? 'single' : undefined} paddingX={1}>
              <Text>
                {isPassword && value ? '•'.repeat(value.length) : value}
                {isActive && <Text color="gray">█</Text>}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">
          ↑↓ Navigate • Enter: Next/Save • Esc: Cancel
        </Text>
      </Box>

      <Box>
        <Text color="yellow">
          Current field: {fields[currentField].label}
        </Text>
      </Box>
    </Box>
  );
};

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Configure API keys and settings',
  execute: async (config: Config, onConfigUpdate?: (newConfig: Config) => void) => {
    return <ConfigForm 
      config={config} 
      onSave={(newConfig: Config) => {
        onConfigUpdate?.(newConfig);
      }} 
      onCancel={() => {
        onConfigUpdate?.(config); // Signal to close without changes
      }} 
    />;
  },
};