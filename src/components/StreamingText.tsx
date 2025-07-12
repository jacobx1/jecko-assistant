import React, { useState, useEffect, use } from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

marked.use(markedTerminal({
  reflowText: false
}) as any);

interface StreamingTextProps {
  text: string;
  isComplete?: boolean;
}

export const StreamingText: React.FC<StreamingTextProps> = ({ text }) => {
  const parsedText = marked.parse(text, {
    async: false,
  });
  
  // Remove excessive newlines from markdown parsing
  const cleanedText = typeof parsedText === 'string' 
    ? parsedText.trim()
    : parsedText;
    
  return (
    <Text>
      {cleanedText}
    </Text>
  );
};
