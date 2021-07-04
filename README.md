# Rust rustfmt-check Action

## Example workflow

```yml
format:
    name: rustfmt
    runs-on: ubuntu-latest
    steps:
        - uses: actions/checkout@v2
        - uses: actions-rs/toolchain@v1
          with:
              toolchain: nightly
              components: rustfmt
              override: true
        - uses: LoliGothick/rustfmt-check@master
          with:
              token: ${{ secrets.GITHUB_TOKEN }}
              flags: -all
              options: --manifest-path=Cargo.toml
              args: --config-path=rustfmt.toml
```

## Inputs

|  Name   | Required | Description                                                                                                                          |  Type  |         Default         |
| :-----: | :------: | :----------------------------------------------------------------------------------------------------------------------------------- | :----: | :---------------------: |
|  token  |    ✔    | GitHub secret token, usually a `${{ secrets.GITHUB_TOKEN }}`.                                                                        | string |                         |
|  flags  |          | Flags for the `cargo fmt` command. `--message-format=json` is set by default. `--message-format` and `--check` are omitted silently. | string | `--message-format=json` |
| options |          | Options for the `Cargo fmt` command.                                                                                                 | string |                         |
|  args   |          | Arguments for the `rustfmt` command. `--check` is omitted silently.                                                                 | string |                         |
|  name   |          | Name of the created GitHub check. If running this action multiple times, each run must have a unique name.                           | string |         rustfmt         |
