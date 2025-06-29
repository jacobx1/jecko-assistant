import React, { useState, useEffect, use } from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal} from 'marked-terminal';

marked.use(markedTerminal() as any);

interface StreamingTextProps {
  text: string;
  isComplete?: boolean;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
  text,
}) => {
  return <Text>{marked.parse(text, {
    async: false
  })}</Text>;
};