import { describe, expect, it } from 'vitest';
import { Hydrator, HttpClient, Person, RestGateway, ServerError } from '../src/index.js';

/** Fake Arbor routed by path; `forbid` makes a listing return 403 like Arbor does. */
function fakeArbor(forbid: string[] = []) {
  const ref = (type: string, href: string) => ({ entityType: type, href });
  const records: Record<string, object> = {
    '/rest-v2/academic-level-memberships/1': { academicLevelMembership: { entityType: 'AcademicLevelMembership', href: '/rest-v2/academic-level-memberships/1', academicLevel: { entityType: 'AcademicLevel', href: '/rest-v2/academic-levels/12', academicLevelName: 'Year 12' }, startDate: '2026-09-01 00:00:00', endDate: '2027-08-31 00:00:00' } },
    '/rest-v2/academic-level-memberships/2': { academicLevelMembership: { entityType: 'AcademicLevelMembership', href: '/rest-v2/academic-level-memberships/2', academicLevel: { entityType: 'AcademicLevel', href: '/rest-v2/academic-levels/13', academicLevelName: 'Year 13' }, startDate: '2027-09-01 00:00:00', endDate: '2028-08-31 00:00:00' } },
    '/rest-v2/registration-form-memberships/1': { registrationFormMembership: { entityType: 'RegistrationFormMembership', href: '/rest-v2/registration-form-memberships/1', registrationForm: { entityType: 'RegistrationForm', href: '/rest-v2/registration-forms/1988', registrationFormName: '12BV' }, startDate: '2026-09-01 00:00:00', endDate: '2027-08-31 00:00:00' } },
    '/rest-v2/email-addresses/1': { emailAddress: { entityType: 'EmailAddress', href: '/rest-v2/email-addresses/1', emailAddress: 'student@school.test', emailAddressType: 'PERSONAL' } },
    '/rest-v2/email-addresses/2': { emailAddress: { entityType: 'EmailAddress', href: '/rest-v2/email-addresses/2', emailAddress: 'parent@home.test', emailAddressType: 'PERSONAL' } },
    '/rest-v2/telephone-numbers/1': { telephoneNumber: { entityType: 'TelephoneNumber', href: '/rest-v2/telephone-numbers/1', number: '+441234', extensionNumber: '', telephoneNumberType: 'MOBILE' } },
    '/rest-v2/postal-address-occupancies/1': { postalAddressOccupancy: { entityType: 'PostalAddressOccupancy', href: '/rest-v2/postal-address-occupancies/1', postalAddress: ref('PostalAddress', '/rest-v2/postal-addresses/3'), effectiveDate: '2020-01-01 00:00:00', endDate: null, postalAddressType: 'HOME', isCorrespondenceAddress: true } },
    '/rest-v2/postal-addresses/3': { postalAddress: { entityType: 'PostalAddress', href: '/rest-v2/postal-addresses/3', address1: '5 Bracknell Gardens', address2: '', address3: '', postalTown: 'London', postalCode: 'NW3 7EE' } },
    // relationship → guardian whose nested person is only a stub, as Arbor sends it
    '/rest-v2/student-guardian-relationships/1': { studentGuardianRelationship: { entityType: 'StudentGuardianRelationship', href: '/rest-v2/student-guardian-relationships/1', guardian: { entityType: 'Guardian', href: '/rest-v2/guardians/3', person: { entityType: 'Person' } }, guardianRelationshipType: { entityType: 'GuardianRelationshipType', href: '/rest-v2/guardian-relationship-types/FAMN', code: 'FAMN', relationshipName: 'Mother (natural or adoptive)', shortName: 'Mother' }, isPrimaryGuardian: true, isLegalGuardian: true } },
    '/rest-v2/student-guardian-relationships/2': { studentGuardianRelationship: { entityType: 'StudentGuardianRelationship', href: '/rest-v2/student-guardian-relationships/2', guardian: { entityType: 'Guardian', href: '/rest-v2/guardians/4', person: { entityType: 'Person' } }, guardianRelationshipType: { entityType: 'GuardianRelationshipType', href: '/rest-v2/guardian-relationship-types/RELA', code: 'RELA', relationshipName: 'Other relative', shortName: 'Relative' }, isPrimaryGuardian: false, isLegalGuardian: false } },
    '/rest-v2/guardians/3': { guardian: { entityType: 'Guardian', href: '/rest-v2/guardians/3', person: { entityType: 'Person', href: '/rest-v2/persons/7', legalFirstName: 'Jennifer', legalLastName: 'Robertson' } } },
    '/rest-v2/guardians/4': { guardian: { entityType: 'Guardian', href: '/rest-v2/guardians/4', person: { entityType: 'Person' } } }, // app can't read this Person
  };
  const lists: Record<string, (q: Record<string, string>) => [string, object[]]> = {
    AcademicLevelMemberships: (q) => ['academicLevelMemberships', q['filters.endDate.after'] ? [ref('AcademicLevelMembership', '/rest-v2/academic-level-memberships/1'), ref('AcademicLevelMembership', '/rest-v2/academic-level-memberships/2')] : []],
    RegistrationFormMemberships: (q) => ['registrationFormMemberships', q['filters.endDate.after'] ? [ref('RegistrationFormMembership', '/rest-v2/registration-form-memberships/1')] : []],
    EmailAddresses: (q) => ['emailAddresses', [ref('EmailAddress', q['filters.emailAddressOwner.equals']?.includes('guardians/3') ? '/rest-v2/email-addresses/2' : '/rest-v2/email-addresses/1')]],
    TelephoneNumbers: () => ['telephoneNumbers', [ref('TelephoneNumber', '/rest-v2/telephone-numbers/1')]],
    PostalAddressOccupancies: (q) => ['postalAddressOccupancies', q['filters.endDate.equals'] === 'NULL' ? [ref('PostalAddressOccupancy', '/rest-v2/postal-address-occupancies/1')] : []],
    StudentGuardianRelationships: () => ['studentGuardianRelationships', [ref('StudentGuardianRelationship', '/rest-v2/student-guardian-relationships/2'), ref('StudentGuardianRelationship', '/rest-v2/student-guardian-relationships/1')]],
  };
  const fetch = async (url: string) => {
    const u = new URL(url);
    const name = u.pathname.replace('/rest-v2/', '');
    if (records[u.pathname]) return new Response(JSON.stringify(records[u.pathname]), { status: 200 });
    if (forbid.includes(name)) {
      return new Response(JSON.stringify({ response: { code: 403, reason: `Forbidden: You do not have access to \`${name}\`` } }), { status: 403 });
    }
    const route = lists[name];
    if (route) {
      const [key, items] = route(Object.fromEntries(u.searchParams));
      return new Response(JSON.stringify({ [key]: items }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return new RestGateway(new HttpClient({ baseUrl: 'https://x.test', fetch, maxRequestsPerSecond: Infinity }));
}

const at = new Date(2026, 9, 29);

describe('student lookups', () => {
  it('year group and form pick the membership active at the given date', async () => {
    const api = fakeArbor();
    expect((await api.getYearGroup(4987, at))?.getAcademicLevelName()).toBe('Year 12');
    expect((await api.getYearGroup(4987, new Date(2027, 9, 1)))?.getAcademicLevelName()).toBe('Year 13');
    expect((await api.getCurrentForm(4987, at))?.getRegistrationFormName()).toBe('12BV');
  });

  it('contact details: emails, phones and current addresses', async () => {
    const api = fakeArbor();
    const c = await api.getContactDetails(4987);
    expect(c.unavailable).toEqual([]);
    expect(c.emails.map((e) => [e.address, e.type])).toEqual([['student@school.test', 'PERSONAL']]);
    expect(c.phones.map((p) => [p.number, p.extension, p.type])).toEqual([['+441234', null, 'MOBILE']]);
    expect(c.addresses).toMatchObject([{ lines: ['5 Bracknell Gardens', 'London'], postcode: 'NW3 7EE', type: 'HOME', isCorrespondenceAddress: true }]);
  });

  it('contact details: a forbidden part comes back empty and is listed, not thrown', async () => {
    const api = fakeArbor(['TelephoneNumbers', 'PostalAddressOccupancies']);
    const c = await api.getContactDetails(4987);
    expect(c.emails).toHaveLength(1);
    expect(c.phones).toEqual([]);
    expect(c.addresses).toEqual([]);
    expect(c.unavailable.map((u) => u.part)).toEqual(['addresses', 'phones']);
  });

  it('contact details: errors other than 403 still throw', async () => {
    const http = new HttpClient({ baseUrl: 'https://x.test', maxRequestsPerSecond: Infinity, maxRetries: 0, fetch: async () => new Response('boom', { status: 500 }) });
    await expect(new RestGateway(http).getContactDetails(4987)).rejects.toBeInstanceOf(ServerError);
  });

  it('guardians: reloads stub persons, labels relationships, primary first', async () => {
    const api = fakeArbor();
    const g = await api.getGuardians(4987, { contacts: true });
    expect(g.map((x) => [x.name, x.relationship, x.relationshipCode, x.isPrimary])).toEqual([
      ['Jennifer Robertson', 'Mother', 'FAMN', true],
      [null, 'Relative', 'RELA', false], // Person not readable → name null, no crash
    ]);
    expect(g[0]!.relationshipName).toBe('Mother (natural or adoptive)');
    expect(g[0]!.contacts?.emails.map((e) => e.address)).toEqual(['parent@home.test']);
    expect(g[1]!.person).toBeNull();
  });
});

describe('isRedacted / isReference', () => {
  it('tells stubs, references and full records apart', () => {
    const h = new Hydrator();
    const stub = h.hydrateModel(new Person(), { entityType: 'Person' });
    const ref = h.hydrateModel(new Person(), { entityType: 'Person', href: '/rest-v2/persons/1', id: 1, uniqueObjectId: '9-1' });
    const full = h.hydrateModel(new Person(), { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'A' });
    expect([stub.isRedacted(), stub.isReference()]).toEqual([true, false]);
    expect([ref.isRedacted(), ref.isReference()]).toEqual([false, true]);
    expect([full.isRedacted(), full.isReference()]).toEqual([false, false]);
  });
});
