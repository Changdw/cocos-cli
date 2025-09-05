'use strict';
import { EventEmitter } from "events";
import * as lodash from 'lodash';

class I18n extends EventEmitter {
    _lang: string;

    _data: Record<string, Record<string, any>> = {};
    constructor() {
        super();
        this._lang = 'en';
    }
    /**
         * 注册本地化的数据
         * @param {object} data 本地化 i18n 数据
         * @param {string} language 语言 id
         */
    register(language: string, data: Record<string, any>) {
        language = language || this._lang;
        this._data[language] = data;
        this.emit(`register`, data, language);
    };

    /**
     * 注销本地化数据
     * @param {object} data 本地化 i18n 数据
     * @param {string} language 语言 id
     */
    unregister(language?: string) {
        language = language || this._lang;
        delete this._data[language];
        this.emit('unregister', language);
    };

    /**
     * 附加数据到已经注册的数据里
     * @param {string} paths
     * @param {object} data
     * @param {language} language
     */
    append(paths: string, language: string, data: object | string) {
        this._data[language] = this._data[language] || {};
        lodash.set(this._data[language], paths, data);
        this.emit(`append`, paths, data, language);
    };

    /**
     * 找到内部注册的翻译数据
     * @param {string} key 索引 key
     * @param {string} language 语言 id
     */
    t(key: string, language?: string) {
        language = language || this._lang;
        return lodash.get(this._data[language], key);
    };
}

export const i18n = new I18n();