import type { RestGateway } from '../api/gateway.js';
import { ArborError, ServerError } from '../errors.js';
import type { ModelBase } from '../model/model-base.js';
import type { AcademicLevel } from '../models/AcademicLevel.js';
import { AcademicLevelMembership } from '../models/AcademicLevelMembership.js';
import { EmailAddress } from '../models/EmailAddress.js';
import type { Guardian } from '../models/Guardian.js';
import type { Person } from '../models/Person.js';
import type { PostalAddress } from '../models/PostalAddress.js';
import { PostalAddressOccupancy } from '../models/PostalAddressOccupancy.js';
import type { RegistrationForm } from '../models/RegistrationForm.js';
import { RegistrationFormMembership } from '../models/RegistrationFormMembership.js';
import { StudentGuardianRelationship } from '../models/StudentGuardianRelationship.js';
import { TelephoneNumber } from '../models/TelephoneNumber.js';
import { Query } from '../query/query.js';

type Owner = ModelBase | string | number;

export interface ContactDetails {
  emails: { address: string; type: string | null; model: EmailAddress }[];
  phones: { number: string; extension: string | null; type: string | null; model: TelephoneNumber }[];
  /**
   * Parts the app isn't allowed to read (HTTP 403), e.g.
   * `{ part: 'phones', reason: 'You do not have access to TelephoneNumber.numberOwner…' }`.
   * Those parts come back empty, not as an error.
   */
  unavailable: { part: 'emails' | 'phones' | 'addresses'; reason: string }[];
  /** Current addresses only. */
  addresses: {
    lines: string[];
    postcode: string | null;
    type: string | null;
    isCorrespondenceAddress: boolean;
    model: PostalAddress;
  }[];
}

export interface GuardianInfo {
  guardian: Guardian;
  person: Person | null;
  /** "First Last" from the guardian's person record, if the app can read Person. */
  name: string | null;
  /** Short label, e.g. "Mother". */
  relationship: string | null;
  /** Full label, e.g. "Mother (natural or adoptive)". */
  relationshipName: string | null;
  /** Arbor's code, e.g. "FAMN". */
  relationshipCode: string | null;
  isPrimary: boolean;
  isLegal: boolean;
  /** Only filled in with `{ contacts: true }`. */
  contacts?: ContactDetails;
  model: StudentGuardianRelationship;
}

/** Runs `fn`; a 403 becomes `fallback` plus a note in `unavailable`. Other errors still throw. */
async function permitted<T>(part: ContactDetails['unavailable'][number]['part'], unavailable: ContactDetails['unavailable'], fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServerError && e.status === 403) {
      unavailable.push({ part, reason: e.message });
      return fallback;
    }
    throw e;
  }
}

const isActive = (start: Date | null, end: Date | null, at: Date) => (!start || start <= at) && (!end || end >= at);

/**
 * Common student lookups. Each needs read access to the record types it
 * reads; a missing permission raises a ServerError (403) naming the record type.
 */
export class StudentService {
  constructor(private readonly api: RestGateway) {}

  /** The student's year group (e.g. "Year 12") at `at` (default now), or `null`. Needs AcademicLevelMembership. */
  async yearGroup(student: Owner, at = new Date()): Promise<AcademicLevel | null> {
    const memberships = await this.api.query<AcademicLevelMembership>(
      new Query(AcademicLevelMembership.RESOURCE_TYPE).addPropertyFilter(AcademicLevelMembership.STUDENT, Query.OPERATOR_EQUALS, this.href(student)),
      { current: { at }, load: true },
    );
    const m = memberships.find((x) => isActive(x.getStartDate(), x.getEndDate(), at));
    return m?.getAcademicLevel() ?? null;
  }

  /** The student's form / registration group (e.g. "12BV") at `at`, or `null`. Needs RegistrationFormMembership. */
  async currentForm(student: Owner, at = new Date()): Promise<RegistrationForm | null> {
    const memberships = await this.api.query<RegistrationFormMembership>(
      new Query(RegistrationFormMembership.RESOURCE_TYPE).addPropertyFilter(RegistrationFormMembership.STUDENT, Query.OPERATOR_EQUALS, this.href(student)),
      { current: { at }, load: true },
    );
    const m = memberships.find((x) => isActive(x.getStartDate(), x.getEndDate(), at));
    return m?.getRegistrationForm() ?? null;
  }

  /**
   * Email addresses, phone numbers and current postal addresses owned by a
   * student or guardian. Contact details belong to the Student / Guardian
   * record, not their Person.
   */
  async contactDetails(owner: Owner, at = new Date()): Promise<ContactDetails> {
    const href = this.href(owner);
    const unavailable: ContactDetails['unavailable'] = [];
    const [emails, phones, addresses] = await Promise.all([
      permitted('emails', unavailable, [] as EmailAddress[], () =>
        this.api.query<EmailAddress>(new Query(EmailAddress.RESOURCE_TYPE).addPropertyFilter(EmailAddress.EMAIL_ADDRESS_OWNER, Query.OPERATOR_EQUALS, href), { load: true }),
      ),
      permitted('phones', unavailable, [] as TelephoneNumber[], () =>
        this.api.query<TelephoneNumber>(new Query(TelephoneNumber.RESOURCE_TYPE).addPropertyFilter(TelephoneNumber.NUMBER_OWNER, Query.OPERATOR_EQUALS, href), { load: true }),
      ),
      permitted('addresses', unavailable, [] as { occupancy: PostalAddressOccupancy; address: PostalAddress | null }[], async () => {
        const occupancies = await this.api.query<PostalAddressOccupancy>(
          new Query(PostalAddressOccupancy.RESOURCE_TYPE).addPropertyFilter(PostalAddressOccupancy.OCCUPANT, Query.OPERATOR_EQUALS, href),
          { current: { at }, load: true },
        );
        const current = occupancies.filter((o) => isActive(o.getEffectiveDate(), o.getEndDate(), at));
        return Promise.all(
          current.map(async (o) => {
            const address = o.getPostalAddress();
            if (address?.getResourceUrl() && address.getProperty('address1') === null) await address.load();
            return { occupancy: o, address };
          }),
        );
      }),
    ]);
    unavailable.sort((a, b) => a.part.localeCompare(b.part));

    return {
      unavailable,
      emails: emails
        .filter((e) => e.getEmailAddress())
        .map((e) => ({ address: e.getEmailAddress()!, type: e.getEmailAddressType(), model: e })),
      phones: phones
        .filter((t) => t.getNumber())
        .map((t) => ({ number: t.getNumber()!, extension: t.getExtensionNumber() || null, type: t.getTelephoneNumberType(), model: t })),
      addresses: addresses
        .filter((x): x is { occupancy: PostalAddressOccupancy; address: PostalAddress } => !!x.address?.getResourceUrl())
        .map(({ occupancy, address }) => ({
          lines: [address.getAddress1(), address.getAddress2(), address.getAddress3(), address.getPostalTown()].filter((l): l is string => !!l),
          postcode: address.getPostalCode() || null,
          type: occupancy.getPostalAddressType(),
          isCorrespondenceAddress: occupancy.getIsCorrespondenceAddress() === true,
          model: address,
        })),
    };
  }

  /** The student's guardians, primary ones first. `{ contacts: true }` also fetches each guardian's contact details. */
  async guardians(student: Owner, options: { contacts?: boolean } = {}): Promise<GuardianInfo[]> {
    const relationships = await this.api.query<StudentGuardianRelationship>(
      new Query(StudentGuardianRelationship.RESOURCE_TYPE).addPropertyFilter(StudentGuardianRelationship.STUDENT, Query.OPERATOR_EQUALS, this.href(student)),
      { load: true },
    );
    const result = await Promise.all(
      relationships.map(async (rel): Promise<GuardianInfo | null> => {
        const guardian = rel.getGuardian();
        if (!guardian?.getResourceUrl()) return null;
        // Nested inside the relationship, the guardian's person is often cut down to a stub; the guardian record has it in full.
        const nested = guardian.getPerson();
        if (!nested || nested.isRedacted() || nested.isReference()) await guardian.load();
        let person = guardian.getPerson();
        if (person?.isReference()) person = await person.load();
        if (person?.isRedacted()) person = null; // the app can't read Person
        const name = person ? [person.getLegalFirstName(), person.getLegalLastName()].filter(Boolean).join(' ') || null : null;
        const relType = rel.getGuardianRelationshipType();
        return {
          guardian,
          person,
          name,
          relationship: relType?.getShortName() || relType?.getRelationshipName() || relType?.getCode() || null,
          relationshipName: relType?.getRelationshipName() || null,
          relationshipCode: relType?.getCode() || null,
          isPrimary: rel.getIsPrimaryGuardian() === true,
          isLegal: rel.getIsLegalGuardian() === true,
          contacts: options.contacts ? await this.contactDetails(guardian) : undefined,
          model: rel,
        };
      }),
    );
    return result
      .filter((g): g is GuardianInfo => g !== null)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.name ?? '').localeCompare(b.name ?? ''));
  }

  private href(owner: Owner): string {
    if (typeof owner === 'string' && owner.startsWith('/')) return owner;
    if (typeof owner === 'string' || typeof owner === 'number') return `/rest-v2/${this.api.getResource('Student')}/${owner}`;
    const url = owner.getResourceUrl();
    if (!url) throw new ArborError(`The ${owner.getResourceType()} has no resource URL; save or retrieve it first`);
    return url;
  }
}
