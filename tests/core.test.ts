import { describe, expect, it } from 'vitest';
import {
  CamelCaseToDash,
  Collection,
  Hydrator,
  ModelBase,
  Person,
  PluralizeFilter,
  Query,
  QueryError,
  ResourceType,
  Student,
  UkDfe,
  UkDfeResourceType,
  buildQueryString,
  formatArborDate,
  instantiateModel,
  looselyEqual,
  parseArborDate,
} from '../src/index.js';

describe('filters', () => {
  it('pluralizes like the PHP SDK', () => {
    const p = new PluralizeFilter();
    expect(p.filter('Student')).toBe('Students');
    expect(p.filter('Class')).toBe('Classes');
    expect(p.filter('Search')).toBe('Searches');
    expect(p.filter('Category')).toBe('Categories');
    expect(p.filter('Day')).toBe('Days');
    expect(p.filter('Staff')).toBe('Staffs');
  });

  it('converts camel case to dashes', () => {
    const f = new CamelCaseToDash();
    expect(f.filter('AcademicUnits')).toBe('Academic-Units');
    expect(f.filter('HTMLParser')).toBe('HTML-Parser');
    expect(f.filter('Student')).toBe('Student');
    expect(f.filter('UkDfe_Students')).toBe('Uk-Dfe_Students');
  });
});

describe('dates', () => {
  it('round-trips Y-m-d H:i:s in local time', () => {
    const d = new Date(2024, 0, 5, 9, 3, 7);
    expect(formatArborDate(d)).toBe('2024-01-05 09:03:07');
    expect(parseArborDate('2024-01-05 09:03:07').getTime()).toBe(d.getTime());
    expect(parseArborDate('2024-01-05').getTime()).toBe(new Date(2024, 0, 5).getTime());
  });
});

describe('Query', () => {
  it('builds filter, paging and tag params', () => {
    const person = new Person();
    person.setResourceUrl('/rest-v2/persons/7');
    const q = new Query(ResourceType.STUDENT)
      .addPropertyFilter(Student.PERSON, Query.OPERATOR_EQUALS, person)
      .addPropertyFilter('dateOfBirth', Query.OPERATOR_AFTER, new Date(2010, 5, 1))
      .addPropertyFilter('leftDate', Query.OPERATOR_EQUALS, null)
      .addUserTagFilter('externalId', 'abc')
      .setPageNumber(2)
      .setPageSize(50)
      .setOrderProperty('id');
    q.setTaggings(['one', 'two']);

    expect(q.getQueryOptions()).toEqual({
      'filters.person.equals': '/rest-v2/persons/7',
      'filters.dateOfBirth.after': '2010-06-01 00:00:00',
      'filters.leftDate.equals': 'NULL',
      'filters.tags.externalId': 'abc',
      'page-number': 2,
      'page-size': 50,
      'order-property': 'id',
      'filters.self.tagged': 'two',
    });
  });

  it('rejects unsaved models as filter values', () => {
    const q = new Query('Student').addPropertyFilter('person', 'equals', new Person());
    expect(() => q.getQueryOptions()).toThrow(QueryError);
  });

  it('encodes like http_build_query', () => {
    expect(buildQueryString({ 'filters.id.in': [1, 2], flag: true, off: false, s: 'a b' })).toBe(
      'filters.id.in%5B0%5D=1&filters.id.in%5B1%5D=2&flag=1&off=0&s=a%20b',
    );
  });
});

describe('Hydrator', () => {
  const representation = {
    entityType: 'Student',
    href: '/rest-v2/students/16',
    displayName: 'Ada Lovelace',
    id: 16,
    minimumDataRetentionDate: { entityType: 'date', date: '2020-09-01 00:00:00' },
    person: { entityType: 'Person', href: '/rest-v2/persons/3', legalFirstName: 'Ada' },
    userTags: { externalId: 'x1' },
    memberships: [
      { entityType: 'StudentMembership', href: '/rest-v2/student-memberships/1' },
      'ignored-non-resource',
    ],
  };

  it('hydrates typed models, dates and collections', () => {
    const student = new Hydrator().hydrateModel(new Student(), representation);
    expect(student.getResourceId()).toBe('16');
    expect(student.getDisplayName()).toBe('Ada Lovelace');
    expect(student.getMinimumDataRetentionDate()).toEqual(new Date(2020, 8, 1));
    const person = student.getPerson();
    expect(person).toBeInstanceOf(Person);
    expect(person?.getLegalFirstName()).toBe('Ada');
    expect(student.getUserTags()).toEqual({ externalId: 'x1' });
    const memberships = student.getProperty<Collection>('memberships');
    expect(memberships).toBeInstanceOf(Collection);
    expect(memberships).toHaveLength(1);
  });

  it('extracts back to the same representation', () => {
    const student = new Hydrator().hydrateModel(new Student(), representation);
    const out = new Hydrator().extractArray(student);
    expect(out).toEqual({ ...representation, displayName: undefined, memberships: [representation.memberships[0]] });
    expect(new Hydrator().extractArray(student, true)).toEqual({ entityType: 'Student', href: '/rest-v2/students/16' });
  });

  it('parses the plain date strings the API returns, without changing stored values', () => {
    const person = new Hydrator().hydrateModel(new Person(), {
      entityType: 'Person',
      dateOfBirth: '2010-11-20 00:00:00',
      dateOfDeath: null,
    });
    expect(person.getDateOfBirth()).toEqual(new Date(2010, 10, 20));
    expect(person.getDateOfDeath()).toBeNull();
    expect(person.getProperty('dateOfBirth')).toBe('2010-11-20 00:00:00');
    expect(new Hydrator().extractArray(person).dateOfBirth).toBe('2010-11-20 00:00:00');
    expect(parseArborDate('2020-04-16 23:12:48.565657')).toEqual(new Date(2020, 3, 16, 23, 12, 48));
  });

  it('round-trips through JSON', () => {
    const student = new Hydrator().hydrateModel(new Student(), representation);
    const copy = ModelBase.fromJSON(JSON.parse(JSON.stringify(student)));
    expect(copy).toBeInstanceOf(Student);
    expect((copy as Student).getPerson()?.getLegalFirstName()).toBe('Ada');
  });
});

describe('models', () => {
  it('instantiates registered classes, including module models', () => {
    expect(instantiateModel('Student', null)).toBeInstanceOf(Student);
    expect(instantiateModel(UkDfeResourceType.UK_DFE_STUDENT, null)).toBeInstanceOf(UkDfe.Student);
    const unknown = instantiateModel('SomethingNew', null);
    expect(unknown.constructor).toBe(ModelBase);
    expect(unknown.getResourceType()).toBe('SomethingNew');
  });

  it('exposes property constants and accessors', () => {
    const p = new Person();
    p.setLegalFirstName('Grace');
    expect(Person.LEGAL_FIRST_NAME).toBe('legalFirstName');
    expect(p.getProperties()).toEqual({ legalFirstName: 'Grace' });
    expect(p.getLegalLastName()).toBeNull();
    p.tag('externalId', 9);
    expect(p.getUserTags()).toEqual({ externalId: 9 });
  });
});

describe('looselyEqual (PHP ==)', () => {
  it.each([
    [1, '1', true],
    ['1', '01', true],
    [null, '', true],
    [null, false, true],
    [null, 0, true],
    [true, '1', true],
    [false, '0', true],
    ['abc', 0, false],
    ['', 0, false],
    ['a', 'b', false],
  ])('%j == %j → %s', (a, b, expected) => {
    expect(looselyEqual(a, b)).toBe(expected);
  });
});
