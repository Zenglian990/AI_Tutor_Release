import { html } from 'pinyin-pro';
import DOMPurify from 'dompurify';
import React from 'react';

/**
 * 判断当前学生档案的年级是否属于 1-3 年级（低年级）
 */
export function isLowerGrade(grade) {
  if (!grade) return false;
  const raw = String(grade).toLowerCase();
  return (
    raw.startsWith('1') ||
    raw.startsWith('2') ||
    raw.startsWith('3') ||
    raw.includes('一年级') ||
    raw.includes('二年级') ||
    raw.includes('三年级')
  );
}

/**
 * 递归为字符串或 React 子元素注入标准拼音 (<ruby>)
 * 保证公式（Katex）、代码块、链接、Mermaid等不被破坏
 */
export function injectPinyinToChildren(children, isPinyinActive = false) {
  if (!isPinyinActive || !children) return children;

  const transformNode = (node, keyPrefix = 'py') => {
    if (typeof node === 'string') {
      // Safety net: if raw LaTeX commands ever leaked into a plain text node,
      // convert them into readable standard symbols (e.g. \div -> ÷, \times -> ×, \text{千克} -> 千克)
      const cleanNode = node
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\\div\b/g, '÷')
        .replace(/\\times\b/g, '×')
        .replace(/\\pm\b/g, '±')
        .replace(/\\le\b/g, '≤')
        .replace(/\\ge\b/g, '≥')
        .replace(/\\neq\b/g, '≠')
        .replace(/\\approx\b/g, '≈');

      if (!/[\u4e00-\u9fa5]/.test(cleanNode)) {
        return cleanNode;
      }
      try {
        const rawHtml = html(cleanNode, {
          resultClass: 'py-result-item',
          chineseClass: 'py-chinese-item',
          pinyinClass: 'py-pinyin-item',
          wrapNonChinese: true,
          nonChineseClass: 'py-non-zh'
        });
        const clean = DOMPurify.sanitize(rawHtml, {
          ADD_TAGS: ['ruby', 'rt', 'rp', 'span'],
          ADD_ATTR: ['class']
        });
        return (
          <span
            key={keyPrefix}
            className="pinyin-sentence"
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        );
      } catch (e) {
        return node;
      }
    }

    if (Array.isArray(node)) {
      return node.map((child, idx) => transformNode(child, `${keyPrefix}-${idx}`));
    }

    if (React.isValidElement(node)) {
      // 避免修改具有自身渲染逻辑的组件（如数学公式、代码等）
      if (
        node.props?.className?.includes('katex') ||
        node.type === 'code' ||
        node.type === 'pre'
      ) {
        return node;
      }
      if (node.props?.children) {
        return React.cloneElement(node, {
          ...node.props,
          children: transformNode(node.props.children, `${keyPrefix}-c`)
        });
      }
    }

    return node;
  };

  return transformNode(children);
}
