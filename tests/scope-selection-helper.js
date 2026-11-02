/* Explicit display choice for legacy feature tests. Does not modify business fixtures.
   Default-self and invalid-selection behavior are tested by view-scope-app-browser. */
exports.allPeople=async page=>{
 const control=page.locator('[data-scope-person]');
 if(await control.count())await control.selectOption('all');
};
