import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock window to be global
global.window = global;

describe('Map Utils (map-utils.js)', () => {
  beforeEach(() => {
    // Load and execute the browser-native map-utils.js script inside global scope
    const filePath = path.resolve(__dirname, '../js/map/map-utils.js');
    const code = fs.readFileSync(filePath, 'utf8');
    const executeScript = new Function(code);
    executeScript();
  });

  describe('getMajorLandmarkFromAddress', () => {
    it('should extract major landmark from address', () => {
      expect(window.getMajorLandmarkFromAddress('경상북도 구미시 신평동 구미차병원 뒤편')).toBe('구미차병원');
      expect(window.getMajorLandmarkFromAddress('구미시청 근처')).toBe('구미시청');
      expect(window.getMajorLandmarkFromAddress('금오공과대학교 운동장')).toBe('금오공과대학교');
      expect(window.getMajorLandmarkFromAddress('일반 가정집 주소')).toBeNull();
    });
  });

  describe('extractBuildingNameFromAddress', () => {
    it('should extract building name inside parentheses', () => {
      expect(window.extractBuildingNameFromAddress('구미시 신평동 123 (금오공과대학교 신평캠퍼스)')).toBe('금오공과대학교 신평캠퍼스');
      expect(window.extractBuildingNameFromAddress('구미시 거의동 1 (대학)')).toBe('금오공과대학교 양호동캠퍼스');
      expect(window.extractBuildingNameFromAddress('구미시 원평동 (구미역)')).toBe('구미역');
      expect(window.extractBuildingNameFromAddress('구미시 원평동 (신평동)')).toBeNull();
    });
  });

  describe('cleanDetailedName', () => {
    it('should resolve university campus properly', () => {
      expect(window.cleanDetailedName('대학', 15, false, '구미시 신평동')).toBe('금오공과대학교 신평동캠퍼스');
      expect(window.cleanDetailedName('대학', 15, false, '구미시 거의동')).toBe('금오공과대학교 양호동캠퍼스');
      expect(window.cleanDetailedName('금오공대', 15, false, '구미시 거의동')).toBe('금오공과대학교 양호동캠퍼스');
      expect(window.cleanDetailedName('금오공대', 15, false, '구미시 신평동')).toBe('금오공과대학교 신평동캠퍼스');
    });

    it('should consolidate landmarks at zoom <= 17 with click option', () => {
      expect(window.cleanDetailedName('구미시청주차장', 15, true, '송정동')).toBe('구미시청');
      expect(window.cleanDetailedName('구미역 물품보관함', 15, true, '원평동')).toBe('구미역');
      expect(window.cleanDetailedName('순천향대학교구미병원 장례식장', 15, true, '공단동')).toBe('순천향대학교구미병원');
    });

    it('should preserve original names at high zoom levels (e.g. 18)', () => {
      expect(window.cleanDetailedName('구미시청주차장', 18, true, '송정동')).toBe('구미시청주차장');
    });
  });

  describe('isClickAllowedForZoom', () => {
    it('should allow major T1 landmarks to be clicked at zoom >= 11', () => {
      expect(window.isClickAllowedForZoom('구미시청', '관공서', 11)).toBe(true);
      expect(window.isClickAllowedForZoom('구미시청', '관공서', 10)).toBe(false);
      expect(window.isClickAllowedForZoom('구미역', '역', 11)).toBe(true);
    });

    it('should allow medium T2 landmarks/apartments to be clicked at zoom >= 14', () => {
      expect(window.isClickAllowedForZoom('주민센터', '관공서', 14)).toBe(true);
      expect(window.isClickAllowedForZoom('주민센터', '관공서', 13)).toBe(false);
      expect(window.isClickAllowedForZoom('우미린아파트', '아파트', 14)).toBe(true);
    });

    it('should allow commercial landmarks to be clicked at zoom >= 16', () => {
      expect(window.isClickAllowedForZoom('스타벅스카페', '카페', 16)).toBe(true);
      expect(window.isClickAllowedForZoom('스타벅스카페', '카페', 15)).toBe(false);
    });

    it('should fall back to zoom >= 17 for minor landmarks', () => {
      expect(window.isClickAllowedForZoom('이름없는건물', '기타', 17)).toBe(true);
      expect(window.isClickAllowedForZoom('이름없는건물', '기타', 16)).toBe(false);
    });
  });

  describe('getIconForName', () => {
    it('should return correct emojis for various facility types', () => {
      expect(window.getIconForName('구미역')).toBe('🚉');
      expect(window.getIconForName('구미시청')).toBe('🏛️');
      expect(window.getIconForName('구미차병원')).toBe('🏥');
      expect(window.getIconForName('금오산')).toBe('🌲');
      expect(window.getIconForName('스타벅스')).toBe('☕');
      expect(window.getIconForName('CU 편의점')).toBe('🏪');
      expect(window.getIconForName('이마트')).toBe('🛒');
      expect(window.getIconForName('우미린아파트')).toBe('🏢');
      expect(window.getIconForName('김밥천국')).toBe('🍕');
    });
  });
});
