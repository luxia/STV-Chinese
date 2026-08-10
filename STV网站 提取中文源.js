// ==UserScript==
// @name         STV网站 提取中文源
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  从章节API或已渲染的DOM提取中文，去除多余空格并转换英文符号为中文符号
// @author       luxia
// @match        https://sangtacviet.app/*
// @match        https://sangtacviet.vip/*
// @match        https://sangtacviet.com/*
// @grant        none
// @license      MIT
// @run-at       document-end
// ==/UserScript==
 
(function() {
    'use strict';
 
    const DEBUG = true;
 
    const API_KEYWORDS = ['sajax=readchapter', 'chapter', 'getchapter'];
 
    const CONTAINER_SELECTORS = [
        '.chapter-content',
        '.story-content',
        '.content',
        '#chapter-content',
        '.book-content',
        '.read-content',
        '.novel-content',
        '#content',
        'div[class*="content"]',
        'div[class*="chapter"]'
    ];
 
    function log(...args) {
        if (DEBUG) console.log('[翻译脚本]', ...args);
    }
 
    /**
     * 将英文标点符号转换为中文标点
     * @param {string} text 待处理的文本
     * @returns {string} 转换后的文本
     */
    function replaceEnglishPunctuation(text) {
        // 1. 简单一一对应的符号
        text = text
            .replace(/,/g, '，')
            .replace(/;/g, '；')
            .replace(/:/g, '：')
            .replace(/\?/g, '？')
            .replace(/!/g, '！')
            .replace(/\(/g, '（')
            .replace(/\)/g, '）');
 
        // 2. 句点：保留数字间的小数点，其余替换为句号
        text = text.replace(/(?<!\d)\.(?!\d)/g, '。');
 
        // 3. 省略号：三个连续的点 -> ……
        text = text.replace(/\.{3,}/g, '……');
 
        // 4. 破折号：两个连续的连字符 -> ——
        text = text.replace(/--/g, '——');
 
        // 5. 英文双引号：交替替换为 “ 和 ”
        let leftQuote = true;
        text = text.replace(/"/g, () => {
            const quote = leftQuote ? '“' : '”';
            leftQuote = !leftQuote;
            return quote;
        });
 
        // 6. 英文单引号：交替替换为 ‘ 和 ’
        let leftSingleQuote = true;
        text = text.replace(/'/g, () => {
            const quote = leftSingleQuote ? '‘' : '’';
            leftSingleQuote = !leftSingleQuote;
            return quote;
        });
 
        return text;
    }
 
    // ========== 核心：从HTML提取中文，去空格 + 转符号 ==========
    function extractChineseFromHtml(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const body = doc.body;
        let result = '';
 
        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (tag === 'I') {
                    const t = node.getAttribute('t');
                    if (t) {
                        result += t;
                    } else {
                        result += node.textContent;
                    }
                } else if (tag === 'P' || tag === 'DIV' || tag === 'BR') {
                    if (tag === 'BR') {
                        result += '\n';
                    } else {
                        result += '\n';
                        for (let child of node.childNodes) processNode(child);
                        result += '\n';
                    }
                } else {
                    for (let child of node.childNodes) processNode(child);
                }
            }
        }
 
        for (let child of body.childNodes) processNode(child);
 
        // 清理多余空行
        result = result.replace(/\n{3,}/g, '\n\n');
 
        // 去除中文/中文标点之间的多余空格
        result = result.replace(
            /([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+(?=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g,
            '$1'
        );
        result = result.replace(/\s+([\u3000-\u303f\uff00-\uffef])/g, '$1');
        result = result.replace(/([\u3000-\u303f\uff00-\uffef])\s+/g, '$1');
 
        // 转换英文符号为中文符号
        result = replaceEnglishPunctuation(result);
 
        return result.trim();
    }
 
    // ========== 以下部分与之前相同 ==========
    let chineseContent = null;
 
    function tryExtractFromDOM() {
        if (chineseContent) return;
 
        for (let sel of CONTAINER_SELECTORS) {
            const containers = document.querySelectorAll(sel);
            for (let container of containers) {
                const iTags = container.querySelectorAll('i[t]');
                if (iTags.length > 0) {
                    const html = container.innerHTML;
                    const zh = extractChineseFromHtml(html);
                    if (zh && zh.length > 10) {
                        chineseContent = zh;
                        log('从DOM容器提取中文成功', sel);
                        replaceContent(container);
                        return;
                    }
                }
            }
        }
 
        const allITags = document.querySelectorAll('i[t]');
        if (allITags.length > 0) {
            const zh = extractChineseFromHtml(document.body.innerHTML);
            if (zh && zh.length > 10) {
                chineseContent = zh;
                log('从整个文档提取中文');
                for (let sel of CONTAINER_SELECTORS) {
                    const el = document.querySelector(sel);
                    if (el) {
                        replaceContent(el);
                        break;
                    }
                }
                return;
            }
        }
        log('DOM中未找到可提取的中文');
    }
 
    function replaceContent(container) {
        if (!chineseContent || !container) return;
        if (container.dataset.replaced === 'true') {
            log('容器已替换，跳过');
            return;
        }
        container.innerHTML = chineseContent.replace(/\n/g, '<br>');
        container.dataset.replaced = 'true';
        log('✅ 内容替换成功，长度:', chineseContent.length);
    }
 
    function tryReplaceAll() {
        if (!chineseContent) return;
        let found = false;
        for (let sel of CONTAINER_SELECTORS) {
            const containers = document.querySelectorAll(sel);
            for (let container of containers) {
                if (!container.dataset.replaced) {
                    replaceContent(container);
                    found = true;
                }
            }
        }
        if (!found) log('未找到可替换的容器，等待DOM变化...');
    }
 
    // 拦截 Fetch
    const origFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && API_KEYWORDS.some(kw => url.includes(kw))) {
            log('拦截到Fetch请求:', url);
            return origFetch.apply(this, args).then(response => {
                const cloned = response.clone();
                cloned.json().then(data => {
                    if (data && data.data) {
                        const zh = extractChineseFromHtml(data.data);
                        if (zh && zh.length > 10) {
                            chineseContent = zh;
                            log('从Fetch提取中文成功');
                            tryReplaceAll();
                        }
                    }
                }).catch(err => log('Fetch解析失败:', err));
                return response;
            });
        }
        return origFetch.apply(this, args);
    };
 
    // 拦截 XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            if (this._url && API_KEYWORDS.some(kw => this._url.includes(kw))) {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data.data) {
                        const zh = extractChineseFromHtml(data.data);
                        if (zh && zh.length > 10) {
                            chineseContent = zh;
                            log('从XHR提取中文成功');
                            tryReplaceAll();
                        }
                    }
                } catch (e) { log('XHR解析失败:', e); }
            }
        });
        return origSend.call(this, ...args);
    };
 
    // 监听 DOM 变化
    const observer = new MutationObserver(() => {
        if (!chineseContent) tryExtractFromDOM();
        else tryReplaceAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
 
    // 启动
    setTimeout(() => {
        log('初次尝试从DOM提取中文...');
        tryExtractFromDOM();
        if (chineseContent) tryReplaceAll();
    }, 500);
 
    let retryCount = 0;
    const interval = setInterval(() => {
        if (chineseContent) tryReplaceAll();
        else tryExtractFromDOM();
        retryCount++;
        if (retryCount > 20) clearInterval(interval);
    }, 1000);
 
    log('脚本已启动，等待内容...');
})();