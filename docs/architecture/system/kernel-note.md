# Spectra Kernel Note

> Status: `current`
> Purpose: explain what Spectra is after the six-service split, without slipping back into old monolith language.

## What Spectra Is Now

Spectra is no longer best described as “one backend that does everything”.

It is now:

- a **recursive knowledge system control plane**
- a **workflow shell**
- an **orchestration kernel**
- a **contract surface** over six formal capability authorities

Those authorities are:

- `Diego`
- `Pagevra`
- `Ourograph`
- `Dualweave`
- `Stratumind`
- `Limora`

## What Spectra Still Keeps

Spectra backend still retains a few local organs:

- kernel organs that belong to orchestration itself
- transitional local auxiliaries that support the shell

This does **not** mean the six-service architecture failed.

It means the current shape is:

**an orchestration-centric system core with a small number of explicitly classified local support organs**

not:

- a traditional monolith
- a hollow API gateway
- a backend that still owns second copies of product truth

## Reading Rule

If a local backend module appears to do “real work”, ask:

1. is it orchestration/kernel work?
2. is it a transitional local auxiliary?
3. or is it an old organ that still needs to be cleared?

Only the third category indicates architecture drift.
