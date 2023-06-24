# Rust rustfmt-check Action

This action runs `cargo fmt` and creates annotations to PR.

## Caveats

This action uses `cargo fmt --message-format=json` to get the list of files to check, and it requires nightly toolchain.

## Example workflow

```yml
format:
    name: rustfmt
    runs-on: ubuntu-latest
    steps:
        - uses: actions/checkout@v2
        - run: echo "date=$(date -d '1 month ago' +'%Y-%m-%d')" >> $GITHUB_ENV
        - uses: dtolnay/rust-toolchain@master
          with:
              toolchain: nightly-${{ env.date }}
              components: rustfmt
        - uses: LoliGothick/rustfmt-check@master
          with:
              token: ${{ secrets.GITHUB_TOKEN }}
              toolchain: nightly-${{ env.date }}
              flags: --all
              options: --manifest-path=Cargo.toml
              args: --config-path=path/to/rustfmt.toml
              working-directory: my_crate
```

## Inputs

|       Name        | Required | Description                                                                                                                          |  Type  |         Default         |
|:-----------------:|:--------:|:-------------------------------------------------------------------------------------------------------------------------------------|:------:|:-----------------------:|
|       token       |    ✔     | GitHub secret token, usually a `${{ secrets.GITHUB_TOKEN }}`.                                                                        | string |                         |
|     toolchain     |          | Rust toolchain to use. Use this if you want to use specific version of nightly toolchain.                                            | string |         nightly         |
|       flags       |          | Flags for the `cargo fmt` command. `--message-format=json` is set by default. `--message-format` and `--check` are omitted silently. | string | `--message-format=json` |
|      options      |          | Options for the `cargo fmt` command.                                                                                                 | string |                         |
|       args        |          | Options for the `rustfmt` command. `--check` is omitted silently.                                                                    | string |                         |
|       name        |          | Name of the created GitHub check. If running this action multiple times, each run must have a unique name.                           | string |         rustfmt         |
| working-directory |          | The working directory in which `carg fmt` is executed.                                                                               | string |            .            |
