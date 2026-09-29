import { describe, expect, it } from 'vitest';
import { glyphFor, pickBinding } from '../src/ui/Glyphs';
import { padFamily } from '../src/input/InputManager';

describe('button glyphs', () => {
  const interact = ['Key:KeyE', 'Pad:0'];

  it('picks the keyboard binding for keycaps and the pad binding for pads', () => {
    expect(pickBinding(interact, 'keyboard')).toBe('Key:KeyE');
    expect(pickBinding(interact, 'xbox')).toBe('Pad:0');
    expect(pickBinding(interact, 'playstation')).toBe('Pad:0');
    // No pad binding: fall back to whatever exists.
    expect(pickBinding(['Key:KeyM'], 'xbox')).toBe('Key:KeyM');
  });

  it('draws keys as keycaps', () => {
    expect(glyphFor('Key:KeyE', 'keyboard')).toMatchObject({ text: 'E', pad: false, cls: 'key' });
    expect(glyphFor('Key:Space', 'keyboard')).toMatchObject({ text: 'Space', cls: 'key wide' });
  });

  it('draws the south button as A on Xbox and a cross on PlayStation', () => {
    expect(glyphFor('Pad:0', 'xbox')).toMatchObject({ text: 'A', pad: true, cls: 'face a' });
    expect(glyphFor('Pad:0', 'playstation')).toMatchObject({ text: '✕', pad: true, cls: 'face cross' });
    expect(glyphFor('Pad:1', 'playstation').text).toBe('○');
    expect(glyphFor('Pad:4', 'xbox')).toMatchObject({ text: 'LB', cls: 'shoulder' });
    expect(glyphFor('Pad:6', 'playstation')).toMatchObject({ text: 'L2', cls: 'trigger' });
    expect(glyphFor(undefined, 'xbox').text).toBe('?');
  });

  it('recognises Sony pads by their id', () => {
    expect(padFamily('054c-0ce6-Wireless Controller (STANDARD GAMEPAD)')).toBe('playstation');
    expect(padFamily('DualSense Wireless Controller')).toBe('playstation');
    expect(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(padFamily('Generic USB Joystick')).toBe('xbox');
  });
});
