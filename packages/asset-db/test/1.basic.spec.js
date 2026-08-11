'use strict';

require('chai').should();

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const utils = require('../dist/libs/utils');

describe('工具函数', () => {

    it('absolutePath', async function() {
        if (process.platform === 'win32') {
            utils.absolutePath('c:\\Users\\name').should.to.equal('c:\\Users\\name');
            utils.absolutePath('\\Users\\name').should.not.equal('\\Users\\name');
        } else {
            utils.absolutePath('/Users/name').should.to.equal('/Users/name');
            utils.absolutePath('./Users/name').should.not.equal('./Users/name');
        }
    });

    it('compareVersion', async function() {
        utils.compareVersion('1.0.0.2', '1.0.1').should.to.equal(-1);
        utils.compareVersion('0.0.9', '1.0.0').should.to.equal(-1);
        utils.compareVersion('0.9.0', '1.0.0').should.to.equal(-1);
        utils.compareVersion('0.0.0.2', '0.0.0.3').should.to.equal(-1);

        utils.compareVersion('0.0.0', '0.0.0').should.to.equal(0);
        utils.compareVersion('1.1.1', '1.1.1').should.to.equal(0);

        utils.compareVersion('1.0.0', '0.0.0').should.to.equal(1);
        utils.compareVersion('1.0.0', '0.9.0').should.to.equal(1);
        utils.compareVersion('1.0.0', '0.0.9.9').should.to.equal(1);
    });

    it('nameToId', async function() {
        // 是字符串
        (typeof utils.nameToId('1.0.0.2')).should.to.equal('string');
        // 长度 5
        (utils.nameToId('1.0.0.2').length).should.to.equal(5);
    });

    it('isSubPath', async function() {
        if (process.platform === 'win32') {
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name\\a', 'c:\\Users\\name').should.to.equal(true);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name\\a').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users2\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users2\\name', 'c:\\Users\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name2').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name2', 'c:\\Users\\name').should.to.equal(false);
        } else {
            utils.isSubPath('/Users/name', '/Users/name').should.to.equal(false);
            utils.isSubPath('/Users/name/a', '/Users/name').should.to.equal(true);
            utils.isSubPath('/Users/name', '/Users/name/a').should.to.equal(false);
            utils.isSubPath('/Users/name', '/Users2/name').should.to.equal(false);
            utils.isSubPath('/Users2/name', '/Users/name').should.to.equal(false);
            utils.isSubPath('/Users/name', '/Users/name2').should.to.equal(false);
            utils.isSubPath('/Users/name2', '/Users/name').should.to.equal(false);
        }
    });

});