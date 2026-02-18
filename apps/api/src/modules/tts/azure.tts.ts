/**
 * Azure Text-to-Speech module.
 * Generates audio from script using Azure Cognitive Services Speech SDK.
 */

import * as fs from 'fs';
import * as path from 'path';

const AZURE_SPEECH_KEY = (process.env.AZURE_SPEECH_KEY ?? '').trim();
const AZURE_SPEECH_REGION = (process.env.AZURE_SPEECH_REGION ?? 'eastus').trim();
const AZURE_OUTPUT_FORMAT = (process.env.AZURE_OUTPUT_FORMAT ?? 'riff-24khz-16bit-mono-pcm').trim();
const AUDIO_BASE_DIR = '/opt/exam/audio';

// Ensure audio directory exists
try {
  fs.mkdirSync(AUDIO_BASE_DIR, { recursive: true });
} catch {
  // ignore
}

interface TtsOptions {
  rate?: number; // -20 to +20 percent
  pauseMs?: number; // pause duration in ms
}

const DEFAULT_RATE = -5; // Slightly slower for teacher clarity
const DEFAULT_PAUSE_MS = 500;

/**
 * Enhance script with SSML tags for natural teacher-style speech.
 * Adds pauses, emphasis, and emotional intonation.
 */
function enhanceScriptWithSSML(script: string, lang: 'ru' | 'uz'): string {
  // Clean script first - remove any problematic characters
  let clean = script
    .replace(/[\uD800-\uDFFF]/g, '') // Remove invalid surrogates
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 10) {
    throw new Error(`Script is too short for SSML enhancement: "${clean}"`);
  }

  // Split into sentences - improved regex to handle punctuation better
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && s.length > 3);
  
  if (sentences.length === 0) {
    // Fallback: treat entire script as one sentence
    return clean;
  }
  
  const enhanced: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sentence = sentences[i].trim();
    if (!sentence || sentence.length < 3) continue;

    // Add emphasis on key words (mark positions, don't insert tags yet)
    const emphasisWords: Array<{ word: string; start: number; end: number }> = [];
    
    if (lang === 'ru') {
      const regex = /\b(важно|ключевой|главное|основное|главный|основной|нужно|необходимо|следует|помнить)\b/gi;
      let match;
      while ((match = regex.exec(sentence)) !== null) {
        emphasisWords.push({ word: match[0], start: match.index, end: match.index + match[0].length });
      }
      // Numbers
      const numRegex = /(\d+[%°]?)/g;
      while ((match = numRegex.exec(sentence)) !== null) {
        emphasisWords.push({ word: match[0], start: match.index, end: match.index + match[0].length });
      }
    } else {
      const regex = /\b(muhim|asosiy|bosh|eng|kerak|zarur|eslab)\b/gi;
      let match;
      while ((match = regex.exec(sentence)) !== null) {
        emphasisWords.push({ word: match[0], start: match.index, end: match.index + match[0].length });
      }
      const numRegex = /(\d+[%°]?)/g;
      while ((match = numRegex.exec(sentence)) !== null) {
        emphasisWords.push({ word: match[0], start: match.index, end: match.index + match[0].length });
      }
    }

    // Sort by position (descending) to insert from end
    emphasisWords.sort((a, b) => b.start - a.start);
    
    // Insert emphasis tags from end to start
    let processed = sentence;
    for (const { word, start, end } of emphasisWords) {
      const level = /\d/.test(word) ? 'moderate' : 'strong';
      processed = processed.slice(0, start) + `<emphasis level="${level}">${word}</emphasis>` + processed.slice(end);
    }
    sentence = processed;

    // Mark comma positions for breaks (after emphasis tags are inserted)
    // IMPORTANT: Check that comma is NOT inside any SSML tag
    const commaPositions: number[] = [];
    let searchIdx = sentence.length - 1;
    
    while (searchIdx >= 0) {
      const commaIdx = sentence.lastIndexOf(',', searchIdx);
      if (commaIdx === -1) break;
      
      // Check if comma is inside any SSML tag (emphasis, break, etc.)
      const beforeComma = sentence.substring(0, commaIdx);
      const afterComma = sentence.substring(commaIdx + 1);
      
      // Count all open/close tags before comma
      const openEmphasis = (beforeComma.match(/<emphasis[^>]*>/g) || []).length;
      const closeEmphasis = (beforeComma.match(/<\/emphasis>/g) || []).length;
      const openBreak = (beforeComma.match(/<break[^>]*>/g) || []).length;
      const closeBreak = (beforeComma.match(/<\/break>/g) || []).length;
      
      // Check if there's already a break tag right after this comma
      const hasBreakAfter = /^\s*<break[^>]*>/i.test(afterComma);
      
      // Only add break if: not inside any tag AND no break already exists
      if (openEmphasis === closeEmphasis && openBreak === closeBreak && !hasBreakAfter) {
        commaPositions.push(commaIdx);
      }
      
      searchIdx = commaIdx - 1;
    }

    // Insert break tags after commas (from end to start to preserve positions)
    // IMPORTANT: Work backwards to preserve indices
    for (let i = commaPositions.length - 1; i >= 0; i--) {
      const pos = commaPositions[i];
      const beforeComma = sentence.substring(0, pos + 1);
      const afterComma = sentence.substring(pos + 1);
      
      // Skip if already has break tag immediately after comma
      const trimmedAfter = afterComma.trim();
      if (/^<break[^>]*>/i.test(trimmedAfter)) {
        continue;
      }
      
      // Check if there's a partial break tag (broken) - skip insertion
      if (/<break/i.test(trimmedAfter.slice(0, 50))) {
        console.warn('[Azure TTS] Warning: Found partial break tag, skipping insertion');
        continue;
      }
      
      // Insert break tag safely
      sentence = beforeComma + '<break time="400ms"/>' + (trimmedAfter ? ' ' + trimmedAfter : '');
    }
    
    // Clean up any duplicate break tags that might have been created
    sentence = sentence.replace(/(<break[^>]*>)\s*<break[^>]*>/g, '$1');

    enhanced.push(sentence);

    // Add longer pause after sentences
    if (sentence.match(/[.!?]$/) && i < sentences.length - 2) {
      enhanced.push('<break time="700ms"/>');
    }
  }

  return enhanced.join(' ');
}

/**
 * Generate SSML for Azure TTS with natural teacher-style intonation.
 */
function buildSSML(script: string, lang: 'ru' | 'uz', options: TtsOptions = {}): string {
  // Validate script is not empty
  const trimmedScript = script.trim();
  if (!trimmedScript || trimmedScript.length < 10) {
    throw new Error(`Script is too short or empty: "${trimmedScript}"`);
  }

  const rate = options.rate ?? -5; // Slightly slower for clarity
  const ratePercent = `${rate > 0 ? '+' : ''}${rate}%`;

  // Voice mapping - use expressive neural voices
  const voiceName = lang === 'ru' ? 'ru-RU-MadinaNeural' : 'uz-UZ-MadinaNeural';

  // Enhance script with SSML tags
  const enhancedScript = enhanceScriptWithSSML(trimmedScript, lang);
  
  // Validate enhanced script is not empty
  if (!enhancedScript.trim() || enhancedScript.trim().length < 10) {
    throw new Error(`Enhanced script is too short: "${enhancedScript}"`);
  }

  // Escape XML - preserve SSML tags by using placeholders
  // Use unique placeholders that won't conflict with text
  const placeholderPrefix = `__SSML_PLACEHOLDER_${Date.now()}_`;
  const placeholders: Map<string, string> = new Map();
  let placeholderCounter = 0;
  
  // Replace SSML tags with unique placeholders
  const ssmlTagPattern = /<\/?(?:break|emphasis)[^>]*>/g;
  let textWithPlaceholders = enhancedScript.replace(ssmlTagPattern, (match) => {
    const key = `${placeholderPrefix}${placeholderCounter++}`;
    placeholders.set(key, match);
    return key;
  });
  
  // Escape XML in text content (placeholders are safe - they don't contain XML chars)
  let escaped = textWithPlaceholders
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Restore SSML tags (they're valid XML, don't need escaping)
  for (const [key, tag] of placeholders.entries()) {
    // Escape the placeholder key for regex
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    escaped = escaped.replace(new RegExp(escapedKey, 'g'), tag);
  }

  // Validate pitch value (Azure accepts -50% to +50%)
  const pitchValue = '+2%';
  
  // Ensure escaped content is not empty
  const finalContent = escaped.trim();
  if (!finalContent || finalContent.length < 10) {
    throw new Error(`SSML content is too short after escaping: "${finalContent}"`);
  }
  
  // Validate SSML structure - ensure no empty tags
  if (finalContent.match(/<break\s*\/>/g) && !finalContent.match(/[А-Яа-яA-Za-zЎўҚқҒғҲҳ]/)) {
    throw new Error('SSML contains only break tags, no text content');
  }
  
  // Validate: check for broken/malformed break tags
  const brokenBreakTags = finalContent.match(/<break[^>]*<break/g);
  if (brokenBreakTags) {
    console.error('[Azure TTS] ERROR: Found broken break tags:', brokenBreakTags);
    throw new Error('SSML contains broken break tags');
  }
  
  // Validate: check for unclosed tags
  const openBreaks = (finalContent.match(/<break[^>]*>/g) || []).length;
  const closeBreaks = (finalContent.match(/<\/break>/g) || []).length;
  if (openBreaks !== closeBreaks) {
    console.warn('[Azure TTS] Warning: Break tag mismatch:', { openBreaks, closeBreaks });
  }
  
  // Remove any stray numbers that might have been inserted (like "0", "1", "2" etc.)
  // Also remove numbers that appear between break tags
  // Remove duplicate break tags
  // Fix broken break tags like <break ti<break time="400ms"/> me="400ms"/>
  let cleanedContent = finalContent
    // First, fix broken/nested break tags (most critical)
    .replace(/<break[^>]*<break[^>]*>/g, '<break time="400ms"/>') // Fix nested/broken break tags
    .replace(/<break\s+ti<break[^>]*>\s*me="[^"]*"\/>/g, '<break time="400ms"/>') // Fix specific broken pattern
    .replace(/<break[^>]*>\s*<break[^>]*>/g, '<break time="400ms"/>') // Remove duplicate consecutive break tags
    // Then remove stray numbers
    .replace(/\s+(\d+)\s*(?=<break)/g, ' ') // Remove numbers before break tags
    .replace(/(<\/break>)\s*(\d+)\s*(?=<break)/g, '$1 ') // Remove numbers between break tags
    .replace(/(<\/break>)\s*(\d+)([А-Яа-яA-Za-zЎўҚқҒғҲҳ])/g, '$1 $3') // Remove numbers before text after break
    .replace(/([.!?])\s*(\d+)\s*(?=<break)/g, '$1 ') // Remove numbers after punctuation before break
    // Final cleanup: remove any remaining duplicate breaks
    .replace(/(<break[^>]*>)\s*<break[^>]*>/g, '$1');
  
  const ssml = `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="${lang === 'ru' ? 'ru-RU' : 'uz-UZ'}">
  <voice name="${voiceName}">
    <prosody rate="${ratePercent}" pitch="${pitchValue}">
      <break time="500ms"/>
      ${cleanedContent}
    </prosody>
  </voice>
</speak>`;
  
  // Validate XML structure before returning
  try {
    // Basic XML validation: check for balanced tags
    const openTags = ssml.match(/<[^/!][^>]*>/g) || [];
    const closeTags = ssml.match(/<\/[^>]+>/g) || [];
    const selfClosing = ssml.match(/<[^>]+\/>/g) || [];
    
    // Self-closing tags count as both open and close
    const totalOpen = openTags.length;
    const totalClose = closeTags.length + selfClosing.length;
    
    if (Math.abs(totalOpen - totalClose) > 2) { // Allow some margin for speak/voice/prosody
      console.error('[Azure TTS] XML structure warning:', { totalOpen, totalClose });
    }
  } catch (e) {
    console.error('[Azure TTS] XML validation error:', e);
  }
  
  // Log SSML for debugging (first 500 chars)
  console.log('[Azure TTS] Generated SSML (first 500 chars):', ssml.slice(0, 500));
  
  return ssml;
}

/**
 * Generate audio file from script using Azure TTS REST API.
 * Returns path to generated WAV file.
 */
/**
 * Internal function to send SSML to Azure TTS.
 */
async function synthesizeSpeechWithSSML(ssml: string, outputPath: string): Promise<string> {
  const url = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
      'User-Agent': 'ZiyoMed-TTS/1.0',
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error('[Azure TTS] SSML length:', ssml.length);
    console.error('[Azure TTS] Full SSML:', ssml);
    console.error('[Azure TTS] Error response:', response.status, errorText);
    
    // Try to parse error if it's XML
    let errorMsg = errorText.slice(0, 500);
    try {
      const errorMatch = errorText.match(/<Message>(.*?)<\/Message>/i);
      if (errorMatch) {
        errorMsg = errorMatch[1];
      }
    } catch {
      // ignore
    }
    
    throw new Error(`Azure TTS failed: ${response.status} - ${errorMsg}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioDir = path.dirname(outputPath);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  return outputPath;
}

export async function synthesizeSpeech(
  script: string,
  lang: 'ru' | 'uz',
  outputPath: string,
  options: TtsOptions = {}
): Promise<string> {
  if (!AZURE_SPEECH_KEY) {
    throw new Error('AZURE_SPEECH_KEY not configured');
  }

  const ssml = buildSSML(script, lang, options);
  
  // Validate and fix SSML structure
  const openEmphasis = (ssml.match(/<emphasis[^>]*>/g) || []).length;
  const closeEmphasis = (ssml.match(/<\/emphasis>/g) || []).length;
  
  if (openEmphasis !== closeEmphasis) {
    console.error('[Azure TTS] Emphasis tag mismatch:', { openEmphasis, closeEmphasis });
    // Fix: ensure all emphasis tags are closed
    let fixed = ssml;
    // Count open vs close
    const missingCloses = openEmphasis - closeEmphasis;
    if (missingCloses > 0) {
      // Add closing tags before </prosody>
      fixed = fixed.replace(/<\/prosody>/, '</emphasis>'.repeat(missingCloses) + '</prosody>');
      console.warn('[Azure TTS] Fixed SSML: added', missingCloses, 'closing emphasis tags');
    } else {
      // Too many closes - remove extras (shouldn't happen but be safe)
      const extraCloses = -missingCloses;
      let removed = 0;
      fixed = fixed.replace(/<\/emphasis>/g, (match) => {
        if (removed < extraCloses) {
          removed++;
          return '';
        }
        return match;
      });
      console.warn('[Azure TTS] Fixed SSML: removed', extraCloses, 'extra closing emphasis tags');
    }
    return synthesizeSpeechWithSSML(fixed, outputPath);
  }
  
  return synthesizeSpeechWithSSML(ssml, outputPath);
}

/**
 * Get audio file path for question and language.
 */
export function getAudioPath(questionId: string, lang: 'ru' | 'uz'): string {
  return path.join(AUDIO_BASE_DIR, `${questionId}_${lang}.wav`);
}
