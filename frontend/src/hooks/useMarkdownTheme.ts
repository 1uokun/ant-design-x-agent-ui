import { theme } from 'antd';
import React from 'react';

export const useMarkdownTheme = () => {
  const token = theme.useToken();

  // 使用 Ant Design 的主题系统判断亮色还是暗色
  const isLightMode = React.useMemo(() => {
    return token?.theme?.id === 0;
  }, [token]);

  const className = React.useMemo(() => {
    return isLightMode ? 'x-markdown-light' : 'x-markdown-dark';
  }, [isLightMode]);

  return [className];
};