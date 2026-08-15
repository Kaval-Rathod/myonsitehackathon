import { VerificationEvent } from '@greenlink/shared';
import { DomainError, DerivedEvidence } from './types';

export const deriveAiStatus = (event: VerificationEvent): DerivedEvidence => {
  if (event.confidence < 0 || event.confidence > 1) {
    throw new DomainError('INVALID_CONFIDENCE', 'Confidence must be between 0 and 1');
  }
  return {
    event_id: event.event_id,
    source: 'ai',
    derived_status: event.confidence >= 0.8 ? 'verified' : 'rejected',
    confidence: event.confidence,
    timestamp: event.timestamp,
  };
};

export const deriveSatelliteStatus = (event: VerificationEvent): DerivedEvidence => {
  const vIndex = event.data?.vegetation_index;
  if (typeof vIndex !== 'number' || isNaN(vIndex) || vIndex < 0 || vIndex > 1) {
    throw new DomainError('INVALID_VEGETATION_INDEX', 'Vegetation index must be a number between 0 and 1');
  }
  return {
    event_id: event.event_id,
    source: 'satellite',
    derived_status: vIndex >= 0.6 ? 'verified' : 'rejected',
    confidence: event.confidence,
    timestamp: event.timestamp,
  };
};

export const deriveManualStatus = (event: VerificationEvent): DerivedEvidence => {
  const status = event.data?.status;
  if (status !== 'verified' && status !== 'rejected' && status !== 'pending') {
    throw new DomainError('INVALID_MANUAL_STATUS', 'Manual status must be verified, rejected, or pending');
  }
  return {
    event_id: event.event_id,
    source: 'manual',
    derived_status: status as 'verified' | 'rejected' | 'pending',
    confidence: event.confidence,
    timestamp: event.timestamp,
  };
};

export const deriveEvidence = (event: VerificationEvent): DerivedEvidence => {
  switch (event.source) {
    case 'ai':
      return deriveAiStatus(event);
    case 'satellite':
      return deriveSatelliteStatus(event);
    case 'manual':
      return deriveManualStatus(event);
    default:
      throw new DomainError('INVALID_SOURCE', `Unknown source: ${event.source}`);
  }
};
