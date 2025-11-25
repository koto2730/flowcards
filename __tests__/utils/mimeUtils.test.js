import { mimeTypeLookup } from '../../src/utils/mimeUtils';

describe('mimeTypeLookup', () => {
  it('should be defined', () => {
    expect(mimeTypeLookup).toBeDefined();
  });

  it('should return correct MIME types for common extensions', () => {
    expect(mimeTypeLookup.txt).toBe('text/plain');
    expect(mimeTypeLookup.jpg).toBe('image/jpeg');
    expect(mimeTypeLookup.pdf).toBe('application/pdf');
    expect(mimeTypeLookup.docx).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(mimeTypeLookup.mp4).toBe('video/mp4');
  });

  it('should return undefined for an unknown extension', () => {
    expect(mimeTypeLookup.unknown).toBeUndefined();
    expect(mimeTypeLookup.nonexistent).toBeUndefined();
  });
});
