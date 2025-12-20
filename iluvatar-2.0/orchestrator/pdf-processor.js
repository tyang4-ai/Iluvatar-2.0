/**
 * ILUVATAR 3.0 - PDF Processor
 *
 * Extracts and parses hackathon rules from PDF documents.
 * Uses AI to structure the extracted content.
 */

const pdf = require('pdf-parse');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class PDFProcessor {
  constructor(options = {}) {
    this.tempDir = options.tempDir || '/tmp/iluvatar-pdfs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;  // 10MB
  }

  /**
   * Process PDF from URL
   */
  async processUrl(url) {
    console.log(`  Processing PDF from URL: ${url}`);

    // Download PDF
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxContentLength: this.maxFileSize
    });

    return this.processBuffer(Buffer.from(response.data));
  }

  /**
   * Process PDF from file path
   */
  async processFile(filePath) {
    const buffer = await fs.readFile(filePath);
    return this.processBuffer(buffer);
  }

  /**
   * Process PDF from buffer
   */
  async processBuffer(buffer) {
    // Extract text from PDF
    const data = await pdf(buffer);

    const rawText = data.text;
    const pageCount = data.numpages;

    // Parse the extracted text
    const parsed = this.parseHackathonRules(rawText);

    return {
      raw_text: rawText,
      page_count: pageCount,
      parsed: parsed
    };
  }

  /**
   * Parse hackathon rules from extracted text
   */
  parseHackathonRules(text) {
    const rules = {
      name: this.extractHackathonName(text),
      dates: this.extractDates(text),
      themes: this.extractThemes(text),
      requirements: this.extractRequirements(text),
      judging_criteria: this.extractJudgingCriteria(text),
      prizes: this.extractPrizes(text),
      tech_requirements: this.extractTechRequirements(text),
      submission_requirements: this.extractSubmissionRequirements(text),
      team_rules: this.extractTeamRules(text),
      resources: this.extractResources(text)
    };

    return rules;
  }

  /**
   * Extract hackathon name
   */
  extractHackathonName(text) {
    // Look for common patterns
    const patterns = [
      /^(.+?)\s*hackathon/im,
      /welcome to\s+(.+)/i,
      /^#\s*(.+)/m
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract dates
   */
  extractDates(text) {
    const dates = {
      start: null,
      end: null,
      submission_deadline: null
    };

    // Common date patterns
    const datePatterns = [
      /start(?:s|ing)?[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /end(?:s|ing)?[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /submission[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i
    ];

    // ISO date pattern
    const isoPattern = /\d{4}-\d{2}-\d{2}/g;
    const isoDates = text.match(isoPattern);

    if (isoDates && isoDates.length >= 2) {
      dates.start = isoDates[0];
      dates.end = isoDates[isoDates.length - 1];
    }

    return dates;
  }

  /**
   * Extract themes/tracks
   */
  extractThemes(text) {
    const themes = [];

    // Look for "theme" or "track" sections
    const themeSection = this.extractSection(text, ['themes', 'tracks', 'categories', 'challenges']);

    if (themeSection) {
      // Extract bullet points
      const bullets = themeSection.match(/[-•*]\s*(.+)/g);
      if (bullets) {
        for (const bullet of bullets) {
          themes.push(bullet.replace(/^[-•*]\s*/, '').trim());
        }
      }
    }

    return themes;
  }

  /**
   * Extract requirements
   */
  extractRequirements(text) {
    const requirements = [];

    const reqSection = this.extractSection(text, ['requirements', 'rules', 'guidelines']);

    if (reqSection) {
      const bullets = reqSection.match(/[-•*\d.]\s*(.+)/g);
      if (bullets) {
        for (const bullet of bullets) {
          requirements.push(bullet.replace(/^[-•*\d.]\s*/, '').trim());
        }
      }
    }

    return requirements;
  }

  /**
   * Extract judging criteria
   */
  extractJudgingCriteria(text) {
    const criteria = [];

    const judgingSection = this.extractSection(text, ['judging', 'criteria', 'evaluation']);

    if (judgingSection) {
      // Look for criteria with percentages
      const withPercent = judgingSection.match(/(.+?)\s*[-–:]\s*(\d+)%/g);
      if (withPercent) {
        for (const match of withPercent) {
          const parts = match.match(/(.+?)\s*[-–:]\s*(\d+)%/);
          if (parts) {
            criteria.push({
              name: parts[1].trim(),
              weight: parseInt(parts[2])
            });
          }
        }
      } else {
        // Just extract bullet points
        const bullets = judgingSection.match(/[-•*]\s*(.+)/g);
        if (bullets) {
          for (const bullet of bullets) {
            criteria.push({
              name: bullet.replace(/^[-•*]\s*/, '').trim(),
              weight: null
            });
          }
        }
      }
    }

    return criteria;
  }

  /**
   * Extract prizes
   */
  extractPrizes(text) {
    const prizes = [];

    const prizeSection = this.extractSection(text, ['prizes', 'awards', 'rewards']);

    if (prizeSection) {
      // Look for prize amounts
      const prizeMatches = prizeSection.match(/(\w+\s*(?:place|prize|winner)?)[:\s]*\$?([\d,]+)/gi);
      if (prizeMatches) {
        for (const match of prizeMatches) {
          const parts = match.match(/(\w+\s*(?:place|prize|winner)?)[:\s]*\$?([\d,]+)/i);
          if (parts) {
            prizes.push({
              place: parts[1].trim(),
              amount: parts[2].replace(',', '')
            });
          }
        }
      }
    }

    return prizes;
  }

  /**
   * Extract technical requirements
   */
  extractTechRequirements(text) {
    const techReqs = {
      languages: [],
      frameworks: [],
      apis_required: [],
      platforms: []
    };

    const techSection = this.extractSection(text, ['technical', 'technology', 'tech stack', 'tools']);

    if (techSection) {
      // Common tech terms
      const languages = ['python', 'javascript', 'typescript', 'java', 'c++', 'rust', 'go', 'ruby'];
      const frameworks = ['react', 'vue', 'angular', 'next.js', 'express', 'django', 'flask', 'fastapi'];

      for (const lang of languages) {
        if (techSection.toLowerCase().includes(lang)) {
          techReqs.languages.push(lang);
        }
      }

      for (const fw of frameworks) {
        if (techSection.toLowerCase().includes(fw)) {
          techReqs.frameworks.push(fw);
        }
      }

      // Look for API requirements
      if (techSection.toLowerCase().includes('api')) {
        const apiMatches = techSection.match(/(?:use|integrate|required).*?api/gi);
        if (apiMatches) {
          techReqs.apis_required = apiMatches;
        }
      }
    }

    return techReqs;
  }

  /**
   * Extract submission requirements
   */
  extractSubmissionRequirements(text) {
    const submission = {
      demo_required: false,
      video_required: false,
      max_video_length: null,
      github_required: false,
      devpost_required: false,
      presentation_required: false
    };

    const subSection = this.extractSection(text, ['submission', 'deliverables', 'what to submit']);

    if (subSection) {
      const lower = subSection.toLowerCase();

      submission.demo_required = lower.includes('demo') || lower.includes('live');
      submission.video_required = lower.includes('video');
      submission.github_required = lower.includes('github') || lower.includes('repository');
      submission.devpost_required = lower.includes('devpost');
      submission.presentation_required = lower.includes('presentation') || lower.includes('pitch');

      // Extract video length
      const videoLength = subSection.match(/(\d+)\s*(?:minute|min)/i);
      if (videoLength) {
        submission.max_video_length = parseInt(videoLength[1]);
      }
    }

    return submission;
  }

  /**
   * Extract team rules
   */
  extractTeamRules(text) {
    const teamRules = {
      min_size: 1,
      max_size: null,
      solo_allowed: true
    };

    const teamSection = this.extractSection(text, ['team', 'participants', 'eligibility']);

    if (teamSection) {
      // Team size
      const sizeMatch = teamSection.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*(?:members|people|participants)/i);
      if (sizeMatch) {
        teamRules.min_size = parseInt(sizeMatch[1]);
        teamRules.max_size = parseInt(sizeMatch[2]);
      }

      const maxMatch = teamSection.match(/(?:max|maximum|up to)\s*(\d+)/i);
      if (maxMatch) {
        teamRules.max_size = parseInt(maxMatch[1]);
      }

      teamRules.solo_allowed = !teamSection.toLowerCase().includes('team required');
    }

    return teamRules;
  }

  /**
   * Extract resources/APIs provided
   */
  extractResources(text) {
    const resources = [];

    const resourceSection = this.extractSection(text, ['resources', 'provided', 'apis', 'credits']);

    if (resourceSection) {
      const bullets = resourceSection.match(/[-•*]\s*(.+)/g);
      if (bullets) {
        for (const bullet of bullets) {
          resources.push(bullet.replace(/^[-•*]\s*/, '').trim());
        }
      }
    }

    return resources;
  }

  /**
   * Extract a section by keywords
   */
  extractSection(text, keywords) {
    for (const keyword of keywords) {
      const pattern = new RegExp(
        `(?:^|\\n)\\s*(?:#+\\s*)?${keyword}[:\\s]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#+|[A-Z][A-Za-z\\s]+:)|$)`,
        'i'
      );

      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }
}

module.exports = { PDFProcessor };
