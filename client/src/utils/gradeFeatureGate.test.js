import { describe, it, expect } from 'vitest';
import { parseGradeLevel, isFeatureVisible, getEssayFeatureConfig, getExamFeatureConfig } from './gradeFeatureGate';

describe('gradeFeatureGate (年级与学科功能网关)', () => {
  it('correctly parses various grade strings into standard numbers', () => {
    expect(parseGradeLevel('1_up')).toBe(1);
    expect(parseGradeLevel('2_down')).toBe(2);
    expect(parseGradeLevel('二年级上册')).toBe(2);
    expect(parseGradeLevel('7_up')).toBe(7);
    expect(parseGradeLevel('初一上册')).toBe(7);
    expect(parseGradeLevel('8_up')).toBe(8);
    expect(parseGradeLevel('9_down')).toBe(9);
    expect(parseGradeLevel('10_up')).toBe(10);
    expect(parseGradeLevel('高三下册')).toBe(12);
  });

  describe('Primary School Grade 2 Chinese (二年级上册 语文 - 曾先生真机场景)', () => {
    const grade = '2_up';
    const subject = '语文';

    it('blocks junior high physics lab', () => {
      expect(isFeatureVisible('physicsSimulator', grade, subject)).toBe(false);
    });

    it('blocks junior high chemistry lab', () => {
      expect(isFeatureVisible('chemistryLab', grade, subject)).toBe(false);
    });

    it('blocks junior high CAS algebra scratchpad', () => {
      expect(isFeatureVisible('stepScratchpad', grade, subject)).toBe(false);
    });

    it('blocks dynamic geometry sandbox', () => {
      expect(isFeatureVisible('geometrySandbox', grade, subject)).toBe(false);
    });

    it('blocks junior high formula handbook', () => {
      expect(isFeatureVisible('formulaHandbook', grade, subject)).toBe(false);
    });

    it('blocks middle school campaign roadmap', () => {
      expect(isFeatureVisible('campaignRoadmap', grade, subject)).toBe(false);
    });

    it('blocks math symbols toolbar in Chinese class', () => {
      expect(isFeatureVisible('mathSymbols', grade, subject)).toBe(false);
    });

    it('allows age-adapted essay/picture writing in Chinese class with lower grade title', () => {
      expect(isFeatureVisible('essay', grade, subject)).toBe(true);
      const essayConfig = getEssayFeatureConfig(grade);
      expect(essayConfig.title).toBe('看图写话趣味点拨');
    });

    it('allows universal daily card, eye care timer, print, and prerequisite trace', () => {
      expect(isFeatureVisible('dailyCard', grade, subject)).toBe(true);
      expect(isFeatureVisible('eyeCare', grade, subject)).toBe(true);
      expect(isFeatureVisible('print', grade, subject)).toBe(true);
      expect(isFeatureVisible('prerequisiteTrace', grade, subject)).toBe(true);
    });
  });

  describe('Primary School Math (小学数学)', () => {
    it('shows manipulatives and mental math for Grade 2 Math', () => {
      expect(isFeatureVisible('manipulatives', '2_up', '数学')).toBe(true);
      expect(isFeatureVisible('mentalMath', '2_up', '数学')).toBe(true);
    });

    it('hides manipulatives for Grade 8 Math', () => {
      expect(isFeatureVisible('manipulatives', '8_up', '数学')).toBe(false);
    });
  });

  describe('Junior High Grades (7-9年级)', () => {
    it('Grade 7 (初一) does NOT have Physics or Chemistry', () => {
      expect(isFeatureVisible('physicsSimulator', '7_up', '物理')).toBe(false);
      expect(isFeatureVisible('chemistryLab', '7_up', '化学')).toBe(false);
      expect(isFeatureVisible('stepScratchpad', '7_up', '数学')).toBe(true);
      expect(isFeatureVisible('geometrySandbox', '7_up', '数学')).toBe(true);
    });

    it('Grade 8 (初二) has Physics but NOT Chemistry', () => {
      expect(isFeatureVisible('physicsSimulator', '8_up', '物理')).toBe(true);
      expect(isFeatureVisible('chemistryLab', '8_up', '化学')).toBe(false);
    });

    it('Grade 9 (初三) has both Physics and Chemistry', () => {
      expect(isFeatureVisible('physicsSimulator', '9_up', '物理')).toBe(true);
      expect(isFeatureVisible('chemistryLab', '9_up', '化学')).toBe(true);
      expect(isFeatureVisible('campaignRoadmap', '9_up', '数学')).toBe(true);
    });
  });

  describe('Adaptive Exam and Essay Labels', () => {
    it('Grade 2 gets unit assessment, Grade 9 gets Zhongkao, Grade 12 gets Gaokao', () => {
      expect(getExamFeatureConfig('2_up').title).toContain('单元达标');
      expect(getExamFeatureConfig('9_up').title).toContain('中考');
      expect(getExamFeatureConfig('12_up').title).toContain('高考');
    });

    it('Essay labels adapt from Grade 2 to Grade 12', () => {
      expect(getEssayFeatureConfig('2_up').title).toBe('看图写话趣味点拨');
      expect(getEssayFeatureConfig('5_up').title).toBe('小学记叙文名师升格');
      expect(getEssayFeatureConfig('9_up').title).toBe('中考作文名师精批');
      expect(getEssayFeatureConfig('12_up').title).toBe('高考作文思辨精批');
    });
  });
});
